import { Readable } from 'node:stream';
import type {
  DriveByteRange,
  DriveContentStreamResult,
  DriveFileMetadata,
  GoogleDriveClient,
} from '../../src/google/drive-types.js';
import { mapDriveError } from '../../src/google/drive-error-mapper.js';
import type { AppError } from '../../src/errors/app-error.js';

export interface FakeDriveFile {
  metadata: DriveFileMetadata;
  content: Buffer;
}

export function fakeMetadata(
  overrides: Partial<DriveFileMetadata> & { id: string },
): DriveFileMetadata {
  return {
    name: `${overrides.id}.bin`,
    mimeType: 'application/octet-stream',
    size: 0,
    parents: [],
    trashed: false,
    ...overrides,
  };
}

interface FailurePlan {
  status: number;
  remaining: number;
}

/**
 * Real `googleapis` calls fail with a raw HTTP-shaped error, and
 * `RealGoogleDriveClient` maps that to an `AppError` before it ever leaves
 * the client (see `real-drive-client.ts`). This fake must honor the same
 * `GoogleDriveClient` contract — every implementation always throws an
 * already-mapped `AppError`, never a raw Google-shaped error — so it runs
 * the same mapper here instead of throwing the raw shape directly.
 */
function simulatedError(status: number): AppError {
  return mapDriveError({ response: { status } });
}

/**
 * In-memory stand-in for the Google Drive API, keyed by fake file ID. Lets
 * tests drive every branch of the media gateway (metadata, ancestry,
 * content streaming, transient/permanent failures) without any network
 * access or real credential.
 */
export class FakeGoogleDriveClient implements GoogleDriveClient {
  public metadataCallCount = 0;
  public contentCallCount = 0;
  public lastRequestedRange: DriveByteRange | undefined;

  private readonly failurePlans = new Map<string, FailurePlan>();
  private readonly customStreams = new Map<string, () => Readable>();

  constructor(private readonly files: Record<string, FakeDriveFile>) {}

  /** The next `times` metadata+content calls for `fileId` throw a Google-shaped error with this HTTP status, then succeed normally. */
  planFailures(fileId: string, status: number, times = 1): void {
    this.failurePlans.set(fileId, { status, remaining: times });
  }

  /** Overrides the stream returned for `fileId`'s content — used to simulate a stream that errors mid-transfer. */
  setCustomStream(fileId: string, factory: () => Readable): void {
    this.customStreams.set(fileId, factory);
  }

  private consumeFailurePlan(fileId: string): void {
    const plan = this.failurePlans.get(fileId);
    if (plan && plan.remaining > 0) {
      plan.remaining -= 1;
      throw simulatedError(plan.status);
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    this.metadataCallCount++;
    this.consumeFailurePlan(fileId);
    const file = this.files[fileId];
    if (!file) throw simulatedError(404);
    return file.metadata;
  }

  async getFileContentStream(
    fileId: string,
    range?: DriveByteRange,
  ): Promise<DriveContentStreamResult> {
    this.contentCallCount++;
    this.lastRequestedRange = range;
    this.consumeFailurePlan(fileId);

    const customFactory = this.customStreams.get(fileId);
    if (customFactory) {
      return { stream: customFactory() };
    }

    const file = this.files[fileId];
    if (!file) throw simulatedError(404);

    const slice = range ? file.content.subarray(range.start, range.end + 1) : file.content;
    return { stream: Readable.from(slice) };
  }

  async findFilesByName(name: string): Promise<DriveFileMetadata[]> {
    return Object.values(this.files)
      .map((f) => f.metadata)
      .filter((m) => m.name === name && !m.trashed);
  }

  async listFilesInFolder(folderId: string): Promise<DriveFileMetadata[]> {
    return Object.values(this.files)
      .map((f) => f.metadata)
      .filter((m) => m.parents.includes(folderId) && !m.trashed);
  }
}
