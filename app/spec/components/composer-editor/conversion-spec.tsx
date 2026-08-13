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

    expect(convertToHTML(value)).not.toContain('color');
    expect(convertToPlainText(value)).toContain('Visible text');
  });

  it('preserves intentional non-neutral text colors', () => {
    const value = convertFromHTML('<span style="color: rgb(200, 20, 20)">Red text</span>');

    expect(convertToHTML(value)).toContain('rgb(200, 20, 20)');
  });

  it('preserves newlines represented by white-space: pre-wrap', () => {
    const value = convertFromHTML(
      '<div style="white-space: pre-wrap">First line\nSecond line</div>'
    );

    expect(convertToPlainText(value)).toBe('First line\nSecond line');
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
