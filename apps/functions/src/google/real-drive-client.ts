import { google, type drive_v3 } from 'googleapis';
import { mapDriveError } from './drive-error-mapper.js';
import {
  DRIVE_SHORTCUT_MIME_TYPE,
  type DriveByteRange,
  type DriveContentStreamResult,
  type DriveFileMetadata,
  type GoogleDriveClient,
} from './drive-types.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const METADATA_FIELDS = 'id,name,mimeType,size,parents,trashed,shortcutDetails';

export interface GoogleCredential {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function toMetadata(file: drive_v3.Schema$File): DriveFileMetadata {
  return {
    id: file.id ?? '',
    name: file.name ?? '',
    mimeType: file.mimeType ?? '',
    size: file.size !== undefined && file.size !== null ? Number(file.size) : null,
    parents: file.parents ?? [],
    trashed: file.trashed === true,
    shortcutTargetId:
      file.mimeType === DRIVE_SHORTCUT_MIME_TYPE
        ? (file.shortcutDetails?.targetId ?? undefined)
        : undefined,
    shortcutTargetMimeType:
      file.mimeType === DRIVE_SHORTCUT_MIME_TYPE
        ? (file.shortcutDetails?.targetMimeType ?? undefined)
        : undefined,
  };
}

/** Backend-only, read-only Google Drive client. No write/upload method exists on this class. */
export class RealGoogleDriveClient implements GoogleDriveClient {
  private readonly drive: drive_v3.Drive;

  constructor(credential: GoogleCredential) {
    const auth = new google.auth.GoogleAuth({ credentials: credential, scopes: SCOPES });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    try {
      const resp = await this.drive.files.get({ fileId, fields: METADATA_FIELDS });
      return toMetadata(resp.data);
    } catch (err) {
      throw mapDriveError(err);
    }
  }

  async getFileContentStream(
    fileId: string,
    range?: DriveByteRange,
  ): Promise<DriveContentStreamResult> {
    try {
      const resp = await this.drive.files.get(
        { fileId, alt: 'media' },
        {
          responseType: 'stream',
          headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
        },
      );
      return { stream: resp.data };
    } catch (err) {
      throw mapDriveError(err);
    }
  }
}
