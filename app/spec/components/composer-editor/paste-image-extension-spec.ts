import { Utils } from 'mailspring-exports';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  extensionForClipboardMimeType,
  handleFilePasted,
} from '../../../src/components/composer-editor/composer-editor';

describe('extensionForClipboardMimeType', () => {
  it('maps image/png to .png', () =>
    expect(extensionForClipboardMimeType('image/png')).toBe('.png'));
  it('maps image/jpeg to .jpeg', () =>
    expect(extensionForClipboardMimeType('image/jpeg')).toBe('.jpeg'));
  it('maps image/jpg to .jpg', () =>
    expect(extensionForClipboardMimeType('image/jpg')).toBe('.jpg'));
  it('maps image/gif to .gif', () =>
    expect(extensionForClipboardMimeType('image/gif')).toBe('.gif'));
  it('maps image/bmp to .bmp', () =>
    expect(extensionForClipboardMimeType('image/bmp')).toBe('.bmp'));
  it('maps image/webp to .webp', () =>
    expect(extensionForClipboardMimeType('image/webp')).toBe('.webp'));
  it('maps image/tiff to .tiff', () =>
    expect(extensionForClipboardMimeType('image/tiff')).toBe('.tiff'));

  it('returns an empty string for an unrecognized mime type', () =>
    expect(extensionForClipboardMimeType('application/octet-stream')).toBe(''));
});

describe('handleFilePasted', () => {
  const tmpDirsCreated: string[] = [];

  beforeEach(() => {
    // Pasteboard-only blobs have no backing file; force the temp-copy path.
    const { webUtils } = require('electron');
    spyOn(webUtils, 'getPathForFile').andReturn('');
  });

  afterEach(() => {
    while (tmpDirsCreated.length) {
      const dir = tmpDirsCreated.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        // ignore cleanup failures
      }
    }
  });

  function fakePasteEventFor(blob: Blob, type: string) {
    const evt = new Event('paste');
    Object.defineProperty(evt, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type,
            getAsFile: () => blob,
          },
        ],
      },
    });
    return evt as unknown as ClipboardEvent;
  }

  function waitForFileReceived(evt: ClipboardEvent): Promise<string> {
    const { promise, resolve } = Promise.withResolvers<string>();
    const handled = handleFilePasted(evt, (receivedPath: string) => {
      tmpDirsCreated.push(path.dirname(receivedPath));
      resolve(receivedPath);
    });
    expect(handled).toBe(true);
    return promise;
  }

  it('writes a pasted image/jpeg blob to a temp file with a .jpeg extension', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    const evt = fakePasteEventFor(blob, 'image/jpeg');
    const receivedPath = await waitForFileReceived(evt);

    expect(receivedPath.endsWith('.jpeg')).toBe(true);
    expect(fs.existsSync(receivedPath)).toBe(true);
  });

  it('still writes a pasted image/png blob to a temp file with a .png extension', async () => {
    const blob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'image/png' });
    const evt = fakePasteEventFor(blob, 'image/png');
    const receivedPath = await waitForFileReceived(evt);

    expect(receivedPath.endsWith('.png')).toBe(true);
    expect(fs.existsSync(receivedPath)).toBe(true);
  });
});

describe('Utils.shouldDisplayAsImage regression for extensionForClipboardMimeType outputs', () => {
  const validSize = 1024; // within the 512B - 5MB window

  for (const ext of ['.jpeg', '.gif', '.bmp', '.webp']) {
    it(`accepts a ${ext} file`, () => {
      expect(Utils.shouldDisplayAsImage({ name: `Pasted File${ext}`, size: validSize })).toBe(true);
    });
  }

  it('rejects an unrelated extension like .txt', () => {
    expect(Utils.shouldDisplayAsImage({ name: 'Pasted File.txt', size: validSize })).toBe(false);
  });
});
