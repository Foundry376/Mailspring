/*
This block undoes the addition of div.onbeforeinput = () => {}. This is very, very
gross, but Slate uses the presence of this handler (Added in Chrome 105) to activate a
new version of it's event handling, which doesn't quite work properly in our old version
of Slate: https://github.com/ianstormtaylor/slate/issues/5108#issuecomment-1297591129

Since this was added to Chrome in v105, we can be fairly confident nothing else needs
it to exist, or will similarly fall back to document.addEventListener('beforeInput')

One day, we will update Slate to the latest version, but 0.50.x is effectively a rewrite
and we have many custom plugins that need to be re-built and re-tested.
*/
delete HTMLElement.prototype.onbeforeinput;

/*
This block fixes a bug in Chrome where blurring / moving selection away from the composition
dropdown "commits" the composition but does NOT fire a textInput event to tell Slate.

To reproduce the bug, enter Japanese editing mode, type "korewa" and then exit the composition
dropdown without explicitly committing the text (via Return) by clicking anywhere outside the
box. The text will remain visible in the editor but no onChange event is fired.

Patch:

If composition ends but no textinput event has been seen since composition started, build and 
dispatch a TextEvent into the editor manually.
*/

let lastTextInputEvent = null;
document.addEventListener('textInput', e => (lastTextInputEvent = e), true);
document.addEventListener('compositionstart', e => (lastTextInputEvent = null), true);
document.addEventListener(
  'compositionend',
  (e: CompositionEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-slate-editor]')) {
      if (!lastTextInputEvent) {
        console.warn('Manually emitting textInput event for Chrome');
        const t = document.createEvent('TextEvent');
        t.initEvent('textInput', true, true);
        Object.defineProperty(t, 'data', { value: e.data });
        e.target.dispatchEvent(t);
      }
    }
  },
  true
);
