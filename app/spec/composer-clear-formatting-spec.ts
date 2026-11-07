import { clearTextFormatting } from '../src/components/composer-editor/base-mark-plugins';

describe('clearTextFormatting', function () {
  const mark = (type: string, value?: string) => ({
    type,
    data: { toJS: () => (value ? { value } : {}) },
  });

  it('removes all unique formatting marks from the selected text', function () {
    const bold = mark('bold');
    const red = mark('color', '#ff0000');
    const blue = mark('color', '#0000ff');
    const marks = [bold, red, blue];
    const editor: any = {
      value: {
        selection: { isCollapsed: false },
        document: {
          getTextsAtRange: () => [
            { getMarks: () => [bold, red] },
            { getMarks: () => [bold, blue] },
          ],
        },
      },
      removeMark: jasmine.createSpy('removeMark'),
      focus: jasmine.createSpy('focus'),
    };

    clearTextFormatting(editor);
    expect(editor.removeMark.calls.length).toBe(3);
    marks.forEach((m) => expect(editor.removeMark).toHaveBeenCalledWith(m));
    expect(editor.focus).toHaveBeenCalled();
  });

  it('does not modify formatting without a text selection', function () {
    const editor: any = {
      value: { selection: { isCollapsed: true }, document: {} },
      removeMark: jasmine.createSpy('removeMark'),
      focus: jasmine.createSpy('focus'),
    };
    clearTextFormatting(editor);
    expect(editor.removeMark).not.toHaveBeenCalled();
    expect(editor.focus).not.toHaveBeenCalled();
  });
});
