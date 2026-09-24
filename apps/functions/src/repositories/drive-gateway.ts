import type {
  DriveByteRange,
  DriveContentStreamResult,
  DriveFileMetadata,
  GoogleDriveClient,
} from '../google/drive-types.js';
import { DRIVE_FOLDER_MIME_TYPE } from '../google/drive-types.js';
import { withRetry } from './retry.js';

/**
 * Bounds the parent-folder ancestry walk in `isUnderRoot` so a malformed or
 * unexpectedly deep Drive folder structure can never cause runaway API
 * calls. The approved asset root is only ever a few folders deep in
 * practice (root -> category -> asset), so this is a generous ceiling, not
 * a tuned production limit.
 */
const MAX_ANCESTRY_DEPTH = 12;

/**
 * Backend-only, read-only wrapper over `GoogleDriveClient` adding the one
 * piece of domain logic the raw client doesn't have: proving a file lives
 * under the configured asset root before anything is ever served from it.
 * No write/upload capability exists here or anywhere in this backend.
 */
export class DriveGateway {
  constructor(private readonly client: GoogleDriveClient) {}

  async getMetadata(fileId: string): Promise<DriveFileMetadata> {
    return withRetry(() => this.client.getFileMetadata(fileId));
  }

  /**
   * Retried only for the initial request setup (e.g. a 429/503 before any
   * byte streaming begins) — safe, since no content has reached the client
   * yet if this promise itself rejects. Once the promise resolves and bytes
   * start flowing, a later error on the stream itself is never retried here
   * (see `api/media.ts`'s `stream.on('error')` handling): silently retrying
   * mid-transfer could interleave two responses or double-count a partial
   * transfer, so a stream-level failure surfaces as a client-visible abort
   * instead, and the client can retry the whole request.
   */
  async getContentStream(
    fileId: string,
    range?: DriveByteRange,
  ): Promise<DriveContentStreamResult> {
    return withRetry(() => this.client.getFileContentStream(fileId, range));
  }

  /**
   * Walks the file's parent-folder ancestry looking for `rootFolderId`,
   * reusing the caller's already-fetched metadata for the file itself (no
   * duplicate API call for the common one-hop case) and only fetching
   * ancestor metadata beyond that, bounded by `MAX_ANCESTRY_DEPTH`. A file
   * with no path to the root — including one with no parents at all, e.g.
   * directly in "My Drive" — resolves to `false`, never `true` by default.
   * Fails closed: an ancestor that can't be read (deleted, permission
   * inconsistency, or any other transient/permanent error surviving
   * `withRetry`) is treated as a dead end for that branch rather than
   * throwing — an unprovable path must never be treated as containment,
   * and a security check crashing the whole request is worse than it
   * safely resolving to "not contained."
   */
  async isUnderRoot(fileMetadata: DriveFileMetadata, rootFolderId: string): Promise<boolean> {
    if (fileMetadata.parents.includes(rootFolderId)) return true;

    let frontier = fileMetadata.parents;
    const visited = new Set<string>([fileMetadata.id]);

    for (let depth = 1; depth < MAX_ANCESTRY_DEPTH && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        let meta: DriveFileMetadata;
        try {
          meta = await withRetry(() => this.client.getFileMetadata(id));
        } catch {
          continue;
        }
        if (meta.parents.includes(rootFolderId)) return true;
        nextFrontier.push(...meta.parents);
      }
      frontier = nextFrontier;
    }

    return false;
  }

  /**
   * Discovers the one Drive file with an exact `name` that actually lives
   * under `rootFolderId`, without the caller ever needing to already know
   * its file ID. Read-only (`findFilesByName` + the existing
   * `isUnderRoot` ancestry walk) — never a write/upload. A same-named file
   * that exists elsewhere in the service account's visible Drive (outside
   * the root) is never treated as a match; more than one match actually
   * under the root is reported as ambiguous rather than guessing.
   */
  async findUniqueUnderRoot(
    name: string,
    rootFolderId: string,
  ): Promise<
    | { kind: 'found'; metadata: DriveFileMetadata }
    | { kind: 'missing' }
    | { kind: 'ambiguous'; matches: DriveFileMetadata[] }
  > {
    const candidates = await withRetry(() => this.client.findFilesByName(name));
    const nonTrashed = candidates.filter((c) => !c.trashed);

    const underRoot: DriveFileMetadata[] = [];
    for (const candidate of nonTrashed) {
      if (await this.isUnderRoot(candidate, rootFolderId)) underRoot.push(candidate);
    }

    if (underRoot.length === 0) return { kind: 'missing' };
    if (underRoot.length > 1) return { kind: 'ambiguous', matches: underRoot };
    return { kind: 'found', metadata: underRoot[0]! };
  }

  /**
   * Read-only discovery of every non-trashed PDF directly inside `folderId`,
   * but only after proving the folder itself is a real, non-trashed folder
   * living under `rootFolderId` — a folder ID pasted from a Drive share link
   * is never trusted on its own. A folder found outside the root, missing,
   * or not actually a folder returns `folder_not_found`, never partial
   * results. Never a write/upload capability.
   */
  async discoverPdfsInFolder(
    folderId: string,
    rootFolderId: string,
  ): Promise<
    | { kind: 'folder_not_found'; reason: string }
    | { kind: 'no_pdfs'; children: DriveFileMetadata[] }
    | { kind: 'found'; pdf: DriveFileMetadata }
    | { kind: 'ambiguous'; pdfs: DriveFileMetadata[] }
  > {
    let folder: DriveFileMetadata;
    try {
      folder = await withRetry(() => this.client.getFileMetadata(folderId));
    } catch {
      return { kind: 'folder_not_found', reason: 'the folder could not be read' };
    }
    if (folder.trashed) return { kind: 'folder_not_found', reason: 'the folder is trashed' };
    if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      return { kind: 'folder_not_found', reason: `not a folder (mimeType "${folder.mimeType}")` };
    }
    // The configured asset root itself has nothing "above" it (its own
    // `parents` is typically empty), so it can never satisfy a strict
    // below-root containment proof against itself — it trivially IS the
    // root of the approved tree. Every other folder still needs the real
    // ancestry walk.
    const isRootItself = folder.id === rootFolderId;
    if (!isRootItself && !(await this.isUnderRoot(folder, rootFolderId))) {
      return {
        kind: 'folder_not_found',
        reason: 'the folder is outside the configured Drive asset root',
      };
    }

    const children = await withRetry(() => this.client.listFilesInFolder(folderId));
    const pdfs = children.filter((c) => !c.trashed && c.mimeType === 'application/pdf');
    if (pdfs.length === 0) return { kind: 'no_pdfs', children };
    if (pdfs.length > 1) return { kind: 'ambiguous', pdfs };
    return { kind: 'found', pdf: pdfs[0]! };
  }
}
