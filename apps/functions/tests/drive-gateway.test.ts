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

describe('DriveGateway.findUniqueUnderRoot', () => {
  it('finds the one match under the configured root', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: {
        metadata: fakeMetadata({
          id: 'file_1',
          name: 'gate_closed_desktop_v1.png',
          parents: [ROOT],
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.findUniqueUnderRoot('gate_closed_desktop_v1.png', ROOT);
    expect(result).toEqual({ kind: 'found', metadata: expect.objectContaining({ id: 'file_1' }) });
  });

  it('reports missing when no file with that name exists at all', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    const result = await gateway.findUniqueUnderRoot('nope.png', ROOT);
    expect(result).toEqual({ kind: 'missing' });
  });

  it('reports missing when a same-named file exists but only outside the configured root', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: {
        metadata: fakeMetadata({
          id: 'file_1',
          name: 'gate_closed_desktop_v1.png',
          parents: ['some_other_folder'],
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.findUniqueUnderRoot('gate_closed_desktop_v1.png', ROOT);
    expect(result).toEqual({ kind: 'missing' });
  });

  it('reports ambiguous when more than one match actually lives under the root', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: {
        metadata: fakeMetadata({ id: 'file_1', name: 'dup.png', parents: [ROOT] }),
        content: Buffer.alloc(0),
      },
      file_2: {
        metadata: fakeMetadata({ id: 'file_2', name: 'dup.png', parents: [ROOT] }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.findUniqueUnderRoot('dup.png', ROOT);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.matches).toHaveLength(2);
  });

  it('ignores a trashed same-named file even if it would otherwise be under the root', async () => {
    const client = new FakeGoogleDriveClient({
      file_1: {
        metadata: fakeMetadata({
          id: 'file_1',
          name: 'trashed.png',
          parents: [ROOT],
          trashed: true,
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.findUniqueUnderRoot('trashed.png', ROOT);
    expect(result).toEqual({ kind: 'missing' });
  });
});

describe('DriveGateway.discoverPdfsInFolder', () => {
  const FOLDER = 'folder_1';

  function withFolder(children: Record<string, { metadata: ReturnType<typeof fakeMetadata> }>) {
    const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {
      [FOLDER]: {
        metadata: fakeMetadata({
          id: FOLDER,
          name: 'Comic',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [ROOT],
        }),
        content: Buffer.alloc(0),
      },
    };
    for (const [id, f] of Object.entries(children)) {
      files[id] = { metadata: f.metadata, content: Buffer.alloc(0) };
    }
    return new FakeGoogleDriveClient(files);
  }

  it('finds the one PDF directly inside a folder proven under the root', async () => {
    const gateway = new DriveGateway(
      withFolder({
        pdf_1: {
          metadata: fakeMetadata({
            id: 'pdf_1',
            name: 'veoulla_comic.pdf',
            mimeType: 'application/pdf',
            parents: [FOLDER],
          }),
        },
        img_1: {
          metadata: fakeMetadata({
            id: 'img_1',
            name: 'cover.png',
            mimeType: 'image/png',
            parents: [FOLDER],
          }),
        },
      }),
    );
    const result = await gateway.discoverPdfsInFolder(FOLDER, ROOT);
    expect(result).toEqual({ kind: 'found', pdf: expect.objectContaining({ id: 'pdf_1' }) });
  });

  it('reports no_pdfs when the folder has children but none are PDFs', async () => {
    const gateway = new DriveGateway(
      withFolder({
        img_1: {
          metadata: fakeMetadata({
            id: 'img_1',
            name: 'cover.png',
            mimeType: 'image/png',
            parents: [FOLDER],
          }),
        },
      }),
    );
    const result = await gateway.discoverPdfsInFolder(FOLDER, ROOT);
    expect(result.kind).toBe('no_pdfs');
  });

  it('reports ambiguous and lists every candidate when more than one PDF exists', async () => {
    const gateway = new DriveGateway(
      withFolder({
        pdf_1: {
          metadata: fakeMetadata({
            id: 'pdf_1',
            name: 'comic_v1.pdf',
            mimeType: 'application/pdf',
            parents: [FOLDER],
          }),
        },
        pdf_2: {
          metadata: fakeMetadata({
            id: 'pdf_2',
            name: 'comic_v2.pdf',
            mimeType: 'application/pdf',
            parents: [FOLDER],
          }),
        },
      }),
    );
    const result = await gateway.discoverPdfsInFolder(FOLDER, ROOT);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.pdfs.map((p) => p.name).sort()).toEqual(['comic_v1.pdf', 'comic_v2.pdf']);
    }
  });

  it('reports folder_not_found when the folder ID is actually a file, not a folder', async () => {
    const client = new FakeGoogleDriveClient({
      not_a_folder: {
        metadata: fakeMetadata({
          id: 'not_a_folder',
          name: 'oops.pdf',
          mimeType: 'application/pdf',
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.discoverPdfsInFolder('not_a_folder', ROOT);
    expect(result.kind).toBe('folder_not_found');
  });

  it('reports folder_not_found when the folder exists but lives outside the configured root', async () => {
    const client = new FakeGoogleDriveClient({
      [FOLDER]: {
        metadata: fakeMetadata({
          id: FOLDER,
          name: 'Comic',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['some_other_root'],
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.discoverPdfsInFolder(FOLDER, ROOT);
    expect(result).toEqual({
      kind: 'folder_not_found',
      reason: 'the folder is outside the configured Drive asset root',
    });
  });

  it('accepts the configured asset root folder itself (its own parents is empty)', async () => {
    const client = new FakeGoogleDriveClient({
      [ROOT]: {
        metadata: fakeMetadata({
          id: ROOT,
          name: 'Veoullas World Assets',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [],
        }),
        content: Buffer.alloc(0),
      },
      pdf_1: {
        metadata: fakeMetadata({
          id: 'pdf_1',
          name: 'veoulla_comic.pdf',
          mimeType: 'application/pdf',
          parents: [ROOT],
        }),
        content: Buffer.alloc(0),
      },
    });
    const gateway = new DriveGateway(client);
    const result = await gateway.discoverPdfsInFolder(ROOT, ROOT);
    expect(result).toEqual({ kind: 'found', pdf: expect.objectContaining({ id: 'pdf_1' }) });
  });

  it('reports folder_not_found when the folder ID does not resolve at all', async () => {
    const client = new FakeGoogleDriveClient({});
    const gateway = new DriveGateway(client);
    const result = await gateway.discoverPdfsInFolder('missing_folder', ROOT);
    expect(result.kind).toBe('folder_not_found');
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
