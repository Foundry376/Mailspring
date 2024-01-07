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

/*
On MacOS, you can press and hold some keys to see available accent characters, and then
press a number or click the option to add the accent. The sequence of events is:

keydown     (key=e)
keypress    (key=e)
keydown     (key=e, repeat=true)
keydown     (key=e, repeat=true)
keyup     (key=e)
... panel is now open ...
keydown     (key=2) // optional
beforeinput (data=é)
input       (data=é)
keyup       (key=2)

In Slate, the result is "eé" instead of the accented mark replacing the initial e.

This is a patch similar to https://github.com/ianstormtaylor/slate/pull/3041 and is
unfortunately a bit of a state machine. If we see the exact series of steps below,
we delete the preceding character before inserting the new character:

1) a keydown with repeat=true
2) a keyup for the same key
-- no keypress events or non-numeric keydown events --
3) a beforeinput event

Testing notes:
- Verify it works when you click an accent option vs choose it with 1,2,3..
- Verify that it works when your insertion point is at the beginning, middle and end of string
- Verify that it works if the text contains underlined misspellings (fragments)
*/

let repeatingKeyDown = null;
let substitutionsPanelMayBeOpen = false;

document.addEventListener('keydown', e => {
  repeatingKeyDown = e.repeat ? e.key : null;
  if (!['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
    substitutionsPanelMayBeOpen = false;
  }
});

document.addEventListener('keypress', e => {
  substitutionsPanelMayBeOpen = false;
});

document.addEventListener('keyup', e => {
  substitutionsPanelMayBeOpen = repeatingKeyDown && repeatingKeyDown === e.key;
  repeatingKeyDown = false;
});

document.addEventListener('beforeinput', e => {
  if (substitutionsPanelMayBeOpen) {
    substitutionsPanelMayBeOpen = false;
    if (e.target instanceof HTMLElement && e.target.closest('[data-slate-editor]')) {
      console.warn('Manually emitting backspace event for Chrome');

      // You would think that firing keydown AND keyup would be best, but doing that
      // causes the editor to delete forward if your cursor is not at the end of the text
      const t = document.createEvent('TextEvent');
      t.initEvent('keyup', true, true);
      Object.defineProperty(t, 'keyCode', { value: 8 });
      Object.defineProperty(t, 'key', { value: 'Backspace' });
      Object.defineProperty(t, 'code', { value: 'Backspace' });
      e.target.dispatchEvent(t);
    }
  }
});
