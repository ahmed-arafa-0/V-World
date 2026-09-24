import type { Readable } from 'node:stream';

/** Sanitized Drive file metadata — the only Drive fields this backend ever reads. */
export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  /** Bytes. `null` for Google-native formats (Docs/Sheets/Slides) that have no fixed byte size. */
  size: number | null;
  parents: string[];
  trashed: boolean;
  /** Present only when `mimeType` is the Drive shortcut MIME type. */
  shortcutTargetId?: string;
  shortcutTargetMimeType?: string;
}

/** Inclusive byte range, already validated against the file's known total size. */
export interface DriveByteRange {
  start: number;
  end: number;
}

export interface DriveContentStreamResult {
  stream: Readable;
}

/**
 * Thin seam over the Google Drive API so the media gateway can be tested
 * against a deterministic fake instead of the network. Only the read-only
 * operations the gateway actually needs are exposed here — no write/upload
 * capability exists anywhere in this backend.
 */
export interface GoogleDriveClient {
  getFileMetadata(fileId: string): Promise<DriveFileMetadata>;
  /** Fetches file content, honoring an optional inclusive byte range. Never buffers the full file in memory. */
  getFileContentStream(fileId: string, range?: DriveByteRange): Promise<DriveContentStreamResult>;
  /**
   * Read-only exact-name search (`drive.readonly` already permits
   * `files.list`, not only `files.get`) — every non-trashed file anywhere
   * the service account can see with this exact `name`, regardless of
   * folder. Callers are responsible for proving containment under the
   * approved asset root (`DriveGateway.isUnderRoot`/`findUniqueUnderRoot`)
   * before trusting any result — a same-named file could legitimately exist
   * outside the root. Never a write/upload capability.
   */
  findFilesByName(name: string): Promise<DriveFileMetadata[]>;
  /**
   * Read-only listing of a folder's direct (non-trashed) children — the same
   * `drive.readonly` scope that already permits `findFilesByName`. Callers
   * are still responsible for proving the folder itself lives under the
   * approved asset root before trusting any result, exactly as with
   * `findFilesByName`. Never a write/upload capability.
   */
  listFilesInFolder(folderId: string): Promise<DriveFileMetadata[]>;
}

export const DRIVE_SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';
export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
