import {
  clipboardHasRichText,
  shouldAttachPastedFile,
  handleFilePasted,
} from '../../../src/components/composer-editor/composer-editor';

const clipboardWith = (types: { [type: string]: string }) =>
  ({ getData: (type: string) => types[type] || '' }) as any;

describe('clipboardHasRichText', () => {
  it('prefers the HTML table Excel and LibreOffice Calc put alongside a rendered image', () => {
    const html =
      '<html><body><table><tr><td class="xl56">ID</td><td>Domain</td></tr></table></body></html>';
    expect(clipboardHasRichText(clipboardWith({ 'text/html': html }))).toBe(true);
  });

  it('prefers HTML that contains any visible text', () => {
    const html = '<p>Hello <img src="cid:abc"></p>';
    expect(clipboardHasRichText(clipboardWith({ 'text/html': html }))).toBe(true);
  });

  it('still attaches the file for a Chrome "Copy Image" clipboard (bare <img> html)', () => {
    const html = '<meta charset=\'utf-8\'><img src="https://example.com/a.png" alt="">';
    expect(clipboardHasRichText(clipboardWith({ 'text/html': html }))).toBe(false);
  });

  it('returns false when there is no HTML on the clipboard (screenshots, Finder files)', () => {
    expect(clipboardHasRichText(clipboardWith({ 'text/plain': '/Users/me/photo.png' }))).toBe(
      false
    );
  });
});

describe('clipboardHasRichText edge cases', () => {
  it('ignores <style> and <script> text when deciding whether HTML has content', () => {
    const html =
      '<body><style>td{color:red}</style><img src="file:///C:/tmp/clip_image001.png"></body>';
    expect(clipboardHasRichText(clipboardWith({ 'text/html': html }))).toBe(false);
  });

  it('treats whitespace-only HTML as empty', () => {
    expect(clipboardHasRichText(clipboardWith({ 'text/html': '<p>&nbsp;</p><br>' }))).toBe(false);
  });

  it('prefers an empty table (Excel blank-cell selection) over the rendered image', () => {
    const html = '<table><tr><td></td></tr></table>';
    expect(clipboardHasRichText(clipboardWith({ 'text/html': html }))).toBe(true);
  });
});

describe('shouldAttachPastedFile', () => {
  const clipboardWithItems = (types: { [type: string]: string }, kinds: string[]) =>
    ({
      getData: (type: string) => types[type] || '',
      items: kinds.map((kind) => ({ kind })),
    }) as any;

  it('attaches when a file item is present and the HTML is a bare <img>', () => {
    const cb = clipboardWithItems({ 'text/html': '<img src="x.png">' }, ['string', 'file']);
    expect(shouldAttachPastedFile(cb)).toBe(true);
  });

  it('does not attach when a file item is accompanied by an HTML table', () => {
    const cb = clipboardWithItems({ 'text/html': '<table><tr><td>1</td></tr></table>' }, [
      'string',
      'file',
    ]);
    expect(shouldAttachPastedFile(cb)).toBe(false);
  });

  it('does not attach when there is no file item at all', () => {
    const cb = clipboardWithItems({ 'text/html': '<p>hi</p>', 'text/plain': 'hi' }, ['string']);
    expect(shouldAttachPastedFile(cb)).toBe(false);
  });
});

describe('handleFilePasted', () => {
  const fileItem = (name: string) => ({
    kind: 'file',
    type: 'application/octet-stream',
    getAsFile: () => ({ name }),
  });

  it('attaches every file copied from a file manager, not just the first', () => {
    const { webUtils } = require('electron');
    spyOn(webUtils, 'getPathForFile').andCallFake((f: any) => `/Users/me/${f.name}`);
    const received: string[] = [];
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain' }, fileItem('a.pdf'), fileItem('b.pdf')],
      },
    } as any;

    expect(handleFilePasted(event, (p) => received.push(p))).toBe(true);
    expect(received).toEqual(['/Users/me/a.pdf', '/Users/me/b.pdf']);
  });

  it('returns false when the clipboard has no file items', () => {
    const event = { clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] } } as any;
    expect(handleFilePasted(event, () => {})).toBe(false);
  });
});
