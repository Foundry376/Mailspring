import { Editor, Value } from 'slate';
import { EditListPlugin } from '../../../src/components/composer-editor/base-block-plugins';

const text = (t: string) => ({ object: 'text', leaves: [{ object: 'leaf', text: t, marks: [] }] });
const block = (type: string, nodes: any[]) => ({ object: 'block', type, data: {}, nodes });
const div = (t: string) => block('div', [text(t)]);
const listItem = (...nodes: any[]) => block('list_item', nodes);
const list = (...nodes: any[]) => block('ul_list', nodes);

// Built without plugins on purpose: the schema would repair an orphaned `list_item`, and the
// crash we're guarding against only happens in an editor that is no longer normalizing.
function editorWith(nodes: any[]) {
  return new Editor({
    value: Value.fromJSON({
      object: 'value',
      document: { object: 'document', data: {}, nodes },
    } as any),
    plugins: [],
    onChange: () => {},
  });
}

function childTypes(editor: Editor) {
  return (editor.value.document.nodes.toArray() as any[]).map((n) => n.type);
}

function pressKey(editor: Editor, key: string, textToFocus: string, offset = 0) {
  const target = editor.value.document.getTexts().find((t) => t.text === textToFocus);
  editor.moveTo(target.key as any, offset);

  let passedToNext = false;
  EditListPlugin.onKeyDown(
    { key, shiftKey: false, preventDefault: () => {} } as any,
    editor,
    () => {
      passedToNext = true;
    }
  );
  return passedToNext;
}

describe('EditListPlugin', () => {
  // MAILSPRING-CLIENT-EV: email HTML can contain an <li> with no <ul>/<ol> around it. Slate's
  // `unwrapNodeByPath` lifts such a node's one-element path to the empty root path, which
  // `getDescendant` resolves to null, and `splitNodeByPath` then reads `.type` off null.
  ['Enter', 'Backspace', 'Tab'].forEach((key) => {
    it(`ignores ${key} inside a list_item that is not in a list`, () => {
      const editor = editorWith([div('before'), listItem(div('')), div('after')]);
      let passedToNext = false;
      expect(() => {
        passedToNext = pressKey(editor, key, '');
      }).not.toThrow();
      expect(passedToNext).toBe(true);
      expect(childTypes(editor)).toEqual(['div', 'list_item', 'div']);
    });
  });

  it('ignores Enter inside an orphaned list_item that is the only node in the document', () => {
    const editor = editorWith([listItem(div(''))]);
    expect(() => pressKey(editor, 'Enter', '')).not.toThrow();
  });

  it('still exits the list when Enter is pressed in an empty item', () => {
    const editor = editorWith([
      div('before'),
      list(listItem(div('x')), listItem(div(''))),
      div('after'),
    ]);
    expect(pressKey(editor, 'Enter', '')).toBe(false);
    expect(childTypes(editor)).toEqual(['div', 'ul_list', 'div', 'div']);
  });

  it('still splits the item when Enter is pressed mid-text', () => {
    const editor = editorWith([div('before'), list(listItem(div('xy'))), div('after')]);
    expect(pressKey(editor, 'Enter', 'xy', 1)).toBe(false);
    const items = (editor.value.document.nodes.get(1) as any).nodes.toArray() as any[];
    expect(items.map((n) => n.text)).toEqual(['x', 'y']);
  });
});

describe('Slate withoutNormalizing patch', () => {
  // Required here, not at module scope, since installing it mutates `Editor.prototype` for
  // every other spec in the run and the `EditListPlugin` specs above don't need it — they
  // build their editors with `plugins: []` so nothing ever normalizes. A `describe` body runs
  // once, synchronously, before any of its `it`s, so this installs the patch exactly once.
  require('../../../src/components/composer-editor/patch-slate-normalizing');

  it('restores normalization when the callback throws', () => {
    const editor = editorWith([div('hello')]);
    expect((editor as any).tmp.normalize).toBe(true);

    expect(() =>
      editor.withoutNormalizing(() => {
        throw new Error('simulated crash');
      })
    ).toThrow();

    expect((editor as any).tmp.normalize).toBe(true);
  });
});
