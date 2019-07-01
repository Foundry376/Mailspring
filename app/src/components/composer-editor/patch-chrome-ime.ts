/*
This file fixes a bug in Chrome where blurring / moving selection away from the composition
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
