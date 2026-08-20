/*
Slate's `Editor#withoutNormalizing` clears `editor.tmp.normalize`, runs the callback, and then
restores the flag — but it does so without a `try/finally`, so a command that throws from inside
the callback leaves normalization disabled for the rest of that editor's life.

Almost every structural Slate command (delete, insertFragment, splitDescendants, unwrapNode, ...)
runs inside `withoutNormalizing`, and exceptions thrown from a React event handler don't unmount
anything — we report them and the composer stays open. So a single Slate error means the document
is never repaired again for the rest of the session, and structurally invalid nodes that the
schema would normally fix (eg. a `list_item` with no list around it, deserialized from email HTML)
survive to crash later commands.

Restore the flag when the callback throws so one error can't cascade.
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
