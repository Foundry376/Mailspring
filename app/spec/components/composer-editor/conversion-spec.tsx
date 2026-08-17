import { Value } from 'slate';
import {
  convertFromHTML,
  convertToHTML,
  convertToPlainText,
} from '../../../src/components/composer-editor/conversion';
import {
  ComposerEditor,
  normalizePlainTextForPaste,
} from '../../../src/components/composer-editor/composer-editor';

describe('Composer HTML conversion', () => {
  it('drops near-white source text colors that would be unreadable on a light email background', () => {
    const value = convertFromHTML(
      '<ol><li><span style="color: rgb(236, 236, 241)">Visible text</span></li></ol>'
    );

    expect(convertToHTML(value)).not.toContain('rgb(236, 236, 241)');
    expect(convertToPlainText(value)).toContain('Visible text');
  });

  it('drops a near-white source text color without discarding the source font family', () => {
    const value = convertFromHTML(
      '<span style="color: rgb(240, 239, 236)">' +
        '<font style="font-family: Example-Sans, system-ui, sans-serif">Visible text</font>' +
        '</span>'
    );
    const html = convertToHTML(value);

    expect(html).not.toContain('rgb(240, 239, 236)');
    expect(html).toContain('Example-Sans');
    expect(convertToPlainText(value)).toContain('Visible text');
  });

  it('drops near-black source text colors', () => {
    const value = convertFromHTML('<span style="color: #1f1f1f">Dark text</span>');

    expect(convertToHTML(value)).not.toContain('rgb(31, 31, 31)');
    expect(convertToPlainText(value)).toContain('Dark text');
  });

  it('preserves a neutral color just outside the near-black threshold', () => {
    const value = convertFromHTML('<span style="color: #222222">Dark text</span>');

    expect(convertToHTML(value)).toContain('rgb(34, 34, 34)');
  });

  it('preserves intentional non-neutral text colors', () => {
    const value = convertFromHTML('<span style="color: rgb(200, 20, 20)">Red text</span>');

    expect(convertToHTML(value)).toContain('rgb(200, 20, 20)');
  });

  it('classifies rgba source colors from their RGB channels, ignoring alpha', () => {
    const value = convertFromHTML(
      '<span style="color: rgba(255, 255, 255, 0.5)">Faded text</span>'
    );

    expect(convertToHTML(value)).not.toContain('rgba(255, 255, 255, 0.5)');
    expect(convertToPlainText(value)).toContain('Faded text');
  });

  it('drops transparent source text colors rather than sending invisible text', () => {
    const value = convertFromHTML('<span style="color: transparent">Hidden text</span>');

    expect(convertToHTML(value)).not.toContain('rgba(0, 0, 0, 0)');
    expect(convertToPlainText(value)).toContain('Hidden text');
  });

  it('normalizes Windows line endings before plain-text paste', () => {
    expect(normalizePlainTextForPaste('First\r\n\r\nSecond')).toBe('First\n\nSecond');
  });

  it('does not serialize blank lines pasted from Windows as non-breaking-space blocks', () => {
    const initialValue = convertFromHTML('<div>Existing</div>');
    const insertFragment = jasmine.createSpy('insertFragment');
    const preventDefault = jasmine.createSpy('preventDefault');
    const next = jasmine.createSpy('next');
    const editor = {
      value: initialValue,
      isVoid: () => false,
      insertFragment,
    } as any;
    const event = {
      clipboardData: {
        types: ['text/plain'],
        items: [],
        getData: (type: string) => (type === 'text/plain' ? 'First\r\n\r\nSecond' : ''),
      },
      preventDefault,
    } as any;
    const component = new ComposerEditor({ onFileReceived: null } as any);

    component.onPaste(event, editor, next);

    const pasted = Value.create({ document: insertFragment.calls[0].args[0] });
    expect(convertToPlainText(pasted)).toBe('First\n\nSecond');
    expect(convertToHTML(pasted)).not.toContain('&nbsp;');
    expect(preventDefault).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
