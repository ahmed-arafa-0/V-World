import { describe, expect, it } from 'vitest';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';

const ROOT = 'root_folder';

describe('DriveGateway.isUnderRoot', () => {
  it('is true when the file is a direct child of the root', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: [ROOT] });
    expect(await gateway.isUnderRoot(meta, ROOT)).toBe(true);
    // The direct-parent case must not need any extra Drive call.
    expect(client.metadataCallCount).toBe(0);
  });

  it('is true when the root is found several folders up the ancestry', async () => {
    const client = new FakeGoogleDriveClient({
      folder_a: {
        metadata: fakeMetadata({ id: 'folder_a', parents: ['folder_b'] }),
        content: Buffer.alloc(0),
      },
      folder_b: {
        metadata: fakeMetadata({ id: 'folder_b', parents: [ROOT] }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: ['folder_a'] });
    expect(await gateway.isUnderRoot(meta, ROOT)).toBe(true);
    expect(client.metadataCallCount).toBe(2);
  });

  it('is false when a file has multiple parents and none lead to the root', async () => {
    const client = new FakeGoogleDriveClient({
      other_folder: {
        metadata: fakeMetadata({ id: 'other_folder', parents: ['some_other_root'] }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: ['other_folder'] });
    expect(await gateway.isUnderRoot(meta, ROOT)).toBe(false);
  });

  it('is false for a file with no parents at all (e.g. directly in My Drive)', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: [] });
    expect(await gateway.isUnderRoot(meta, ROOT)).toBe(false);
  });

  it('one of several parents matching the root is enough', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: ['unrelated_folder', ROOT] });
    expect(await gateway.isUnderRoot(meta, ROOT)).toBe(true);
  });

  it('fails closed (resolves false, never throws) when an ancestor cannot be read', async () => {
    const client = new FakeGoogleDriveClient({
      other_folder: {
        metadata: fakeMetadata({ id: 'other_folder', parents: ['unreadable_folder'] }),
        content: Buffer.alloc(0),
      },
      // 'unreadable_folder' is intentionally absent from the fake's file
      // map, so fetching its metadata throws MEDIA_FILE_INACCESSIBLE —
      // this must be a dead end, not an unhandled rejection.
    });
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: ['other_folder'] });
    await expect(gateway.isUnderRoot(meta, ROOT)).resolves.toBe(false);
  });

  it('does not loop forever on a cyclic ancestry and eventually resolves false', async () => {
    const client = new FakeGoogleDriveClient({
      folder_a: {
        metadata: fakeMetadata({ id: 'folder_a', parents: ['folder_b'] }),
        content: Buffer.alloc(0),
      },
      folder_b: {
        metadata: fakeMetadata({ id: 'folder_b', parents: ['folder_a'] }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const meta = fakeMetadata({ id: 'file_1', parents: ['folder_a'] });
    await expect(gateway.isUnderRoot(meta, ROOT)).resolves.toBe(false);
  });
});

describe('DriveGateway.getMetadata / getContentStream', () => {
  it('retries a transient (429) metadata failure and succeeds', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: { metadata: fakeMetadata({ id: 'file_1' }), content: Buffer.from('hello') },
    });
    client.planFailures('file_1', 429, 1);
    const gateway = new DriveGateway(client);
    const meta = await gateway.getMetadata('file_1');
    expect(meta.id).toBe('file_1');
    expect(client.metadataCallCount).toBe(2);
  });

  it('does not retry a permanent (404) metadata failure', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    await expect(gateway.getMetadata('missing')).rejects.toMatchObject({
      code: 'MEDIA_FILE_INACCESSIBLE',
    });
    expect(client.metadataCallCount).toBe(1);
  });

  it('retries a transient (503) content-stream setup failure and succeeds', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: { metadata: fakeMetadata({ id: 'file_1' }), content: Buffer.from('hello') },
    });
    client.planFailures('file_1', 503, 1);
    const gateway = new DriveGateway(client);
    const { stream } = await gateway.getContentStream('file_1');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(client.contentCallCount).toBe(2);
  });
});
