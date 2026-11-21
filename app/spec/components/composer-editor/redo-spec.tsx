import { Editor, Value } from 'slate';
import BaseMarkPlugins from '../../../src/components/composer-editor/base-mark-plugins';

describe('Composer shifted redo', () => {
  it('consumes Ctrl+Shift+Z before Chromium can redo another field', () => {
    const editor = new Editor({
      value: Value.fromJSON({
        document: {
          nodes: [{ object: 'block', type: 'div', nodes: [{ object: 'text', text: 'body' }] }],
        },
      } as any),
      plugins: [],
      onChange: () => {},
    });
    spyOn(editor, 'redo');
    const event = new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true });
    spyOn(event, 'preventDefault');
    const next = jasmine.createSpy('next');

    BaseMarkPlugins[0].onKeyDown(event as any, editor, next);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(editor.redo).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes unrelated shortcuts to the remaining plugins', () => {
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, altKey: true });
    const next = jasmine.createSpy('next');
    spyOn(event, 'preventDefault');

    BaseMarkPlugins[0].onKeyDown(event as any, null, next);

    expect(next).toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
