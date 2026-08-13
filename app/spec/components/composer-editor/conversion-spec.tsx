import {
  convertFromHTML,
  convertToHTML,
  convertToPlainText,
} from '../../../src/components/composer-editor/conversion';

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
});
