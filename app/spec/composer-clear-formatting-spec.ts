import { Editor } from 'slate';
import { clearTextFormatting } from '../src/components/composer-editor/base-mark-plugins';
import { convertFromHTML } from '../src/components/composer-editor/conversion';

function editorWithFormatting() {
  return new Editor({
    value: convertFromHTML(
      '<div><b><font color="#ff0000" size="5"><a href="https://example.com/">red link</a></font></b>' +
        '<i><font color="#0000ff"> blue</font></i></div>'
    ),
    plugins: [],
    onChange: () => {},
  });
}

describe('clearTextFormatting', () => {
  it('clears mixed formatting across a real Slate selection', () => {
    const editor = editorWithFormatting();
    editor.moveToRangeOfDocument();
    clearTextFormatting(editor);

    const marks = editor.value.document.getMarks();
    expect(marks.size).toBe(1);
    expect(marks.first().type).toBe('link');
    expect(marks.first().data.get('href')).toBe('https://example.com/');
    expect(editor.value.document.text).toBe('red link blue');
  });

  it('clears pending formatting at the caret while preserving its link', () => {
    const editor = editorWithFormatting();
    editor.moveTo(editor.value.document.getFirstText().key as any, 3);
    clearTextFormatting(editor);
    editor.insertText('X');

    const inserted = editor.value.document
      .getFirstText()
      .leaves.find((leaf) => leaf.text.includes('X'));
    expect(inserted.marks.size).toBe(1);
    expect(inserted.marks.first().type).toBe('link');
    expect(inserted.marks.first().data.get('href')).toBe('https://example.com/');
  });
});
