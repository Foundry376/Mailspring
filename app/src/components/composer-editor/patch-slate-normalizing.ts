/*
`Editor#withoutNormalizing` clears `tmp.normalize` and restores it without a `try/finally`, so a
command that throws leaves normalization off for the rest of the editor's life — and since we
report composer errors rather than unmount, one thrown Slate command permanently stops the
document from repairing structurally invalid nodes (eg. an orphaned `list_item`). Restore the
flag on throw so a single error can't cascade.
*/
import { Editor } from 'slate';

const prototype = (Editor as any).prototype;
const withoutNormalizing = prototype.withoutNormalizing;

prototype.withoutNormalizing = function (fn: (editor: Editor) => void) {
  const previous = this.tmp.normalize;
  try {
    return withoutNormalizing.call(this, fn);
  } catch (err) {
    this.tmp.normalize = previous;
    throw err;
  }
};
