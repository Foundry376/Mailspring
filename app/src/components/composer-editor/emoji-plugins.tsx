import React from 'react';
import NodeEmoji from 'node-emoji';
import { Actions } from 'mailspring-exports';

import EmojiToolbarPopover from './emoji-toolbar-popover';

let EmojiNameToImageTable = null;

// A Mark type used to store data on the `:emoji` characters that
// cause the floating picker to be displayed.
const EMOJI_TYPING_TYPE = 'emojitype';

// An Inline type used for actual emoji in the editor, which we
// display as images rather than text characters for visual consistency
// across platforms (textual emoji suck on Windows and Linux)
const EMOJI_TYPE = 'emoji';

// The size of the list of floating emoji options
const MAX_EMOJI_SUGGESTIONS = 6;

/* Returns the official emoji names matching the provided text. */
export function getEmojiSuggestions(word) {
  const emojiOptions = [];
  const emojiNames = Object.keys(NodeEmoji.emoji).sort();
  for (const emojiName of emojiNames) {
    if (word === emojiName.substring(0, word.length)) {
      emojiOptions.push(emojiName);
    }
  }
  return emojiOptions;
}

export function getEmojiImagePath(emojiname) {
  EmojiNameToImageTable = EmojiNameToImageTable || require('./emoji-name-to-image-table');
  return process.platform === 'darwin'
    ? `images/composer-emoji/apple/${EmojiNameToImageTable[emojiname]}`
    : `images/composer-emoji/twitter/${EmojiNameToImageTable[emojiname]}`;
}

function ImageBasedEmoji(props) {
  return (
    <img
      alt={props.name}
      draggable={false}
      src={getEmojiImagePath(props.name)}
      width="16"
      height="16"
      style={{ marginTop: '-4px', marginRight: '3px' }}
    />
  );
}

/* React Component that positions itself beneath the [data-emoji-typing] node
within the RichEditor. Note that this positioning logic fails on first render
because it assumes the [data-emoji-typing] noe will have already been rendered.
For the moment, I don't care.

This component doesn't get much in the way of props. It reads /all/ of it's
state (emoji to display, current selection, etc.) from the EMOJI_TYPING_TYPE
mark. Storing the state in the document is a bit odd but worked very well in
the last Mailspring editor.
*/
function FloatingEmojiPicker({ value, onChange }) {
  if (!value.selection.isFocused) return false;
  const sel = document.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);

  let emoji = null;
  try {
    emoji = value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
  } catch (err) {
    // sometimes fails for some reason
  }

  if (!emoji) return false;

  const picked = emoji.data.get('picked');
  const suggestions = emoji.data.get('suggestions');
  if (!suggestions || !suggestions.length) return false;

  const target = range.endContainer.parentElement.closest('[data-emoji-typing]');
  if (!target) return false;

  const relativePositionedParent = target.closest('.RichEditor-content') as HTMLElement;
  const intrinsicPos = relativePositionedParent.getBoundingClientRect();
  const targetPos = target.getBoundingClientRect() as ClientRect;
  const relativeParentW = (relativePositionedParent as any).width;

  if (targetPos.left + 150 > relativeParentW) {
    targetPos.left = relativeParentW - 150;
  }

  const delta = {
    top: targetPos.top + targetPos.height - intrinsicPos.top,
    left: targetPos.left - intrinsicPos.left,
  };

  // Don't display all the selections - just display a few before/after the
  // current selection so the user can "scroll" through them with the arrows
  let start = suggestions.indexOf(picked);
  start = start < 3 ? 0 : start - 2;
  if (start > suggestions.length - MAX_EMOJI_SUGGESTIONS) {
    start = suggestions.length - MAX_EMOJI_SUGGESTIONS;
  }
  const displayedSuggestions = suggestions.slice(start, start + MAX_EMOJI_SUGGESTIONS);

  return (
    <div
      className="emoji-picker"
      style={{ position: 'absolute', left: delta.left, top: delta.top }}
    >
      {displayedSuggestions.map(option => (
        <button
          key={option}
          onMouseDown={e => onChange(swapEmojiMarkFor(value.change(), emoji, option))}
          className={`btn btn-icon ${picked === option && 'emoji-option'}`}
        >
          <ImageBasedEmoji name={option} /> :{option}
        </button>
      ))}
    </div>
  );
}

function renderNode({
  node,
  attributes,
  children,
  targetIsHTML,
}: {
  node?: any;
  attributes?: any;
  children: any;
  targetIsHTML?: boolean;
}) {
  if (node.type === EMOJI_TYPE) {
    const name = node.data.name || node.data.get('name');
    return (
      <span {...attributes} data-emoji-name={name}>
        {targetIsHTML ? NodeEmoji.get(name) : <ImageBasedEmoji name={name} />}
      </span>
    );
  }
}

function renderMark({
  mark,
  children,
  targetIsHTML,
}: {
  mark: any;
  children: any;
  targetIsHTML?: boolean;
}) {
  if (mark.type === EMOJI_TYPING_TYPE) {
    return <span data-emoji-typing={true}>{children}</span>;
  }
}

const rules = [
  {
    deserialize(el, next) {
      if (el.dataset && el.dataset.emojiName) {
        return {
          type: EMOJI_TYPE,
          object: 'inline',
          isVoid: true,
          data: {
            name: el.dataset.emojiName,
          },
        };
      }
    },
    serialize(obj, children) {
      if (obj.object === 'mark') {
        return renderMark({ mark: obj, children, targetIsHTML: true });
      } else if (obj.object === 'inline') {
        return renderNode({ node: obj, children, targetIsHTML: true });
      }
    },
  },
];

export function swapEmojiMarkFor(change, emoji, picked) {
  change.removeMark(emoji);
  if (picked) {
    change.extend(-emoji.data.get('typed').length);
    change.delete();
    change.insertInline({
      object: 'inline',
      type: EMOJI_TYPE,
      isVoid: true,
      data: {
        name: picked,
      },
    });
    change.collapseToStartOfNextText();
  }
  return change;
}

export function updateEmojiMark(change, emoji, { typed, suggestions, picked }) {
  change.extend(-typed.length);
  change.delete();

  // https://sentry.io/foundry-376-llc/mailspring/issues/445604114/
  // Sometimes it appears we overdelete and the mark is gone?
  try {
    if (!change.value.marks.find(i => i.type === EMOJI_TYPING_TYPE)) return change;
  } catch (err) {
    return change;
  }
  change.removeMark(emoji);
  change.addMark({ type: EMOJI_TYPING_TYPE, data: { typed, suggestions, picked } });
  change.insertText(typed);
  return change;
}

function onKeyDown(event, change, editor) {
  if ([' ', 'Return', 'Enter'].includes(event.key)) {
    const emoji = change.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
    if (!emoji) return;
    const picked = emoji.data.get('picked');
    swapEmojiMarkFor(change, emoji, picked);
    if (picked) {
      event.preventDefault();
      return true;
    }
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const dir = event.key.includes('Down') ? 1 : -1;
    const emoji = change.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
    if (!emoji) return;
    const suggestions = emoji.data.get('suggestions');
    const typed = emoji.data.get('typed');
    let picked = emoji.data.get('picked');
    const len = suggestions.length;
    picked = suggestions[(len + suggestions.indexOf(picked) + dir) % len];
    updateEmojiMark(change, emoji, { typed, suggestions, picked });
    event.preventDefault();
    return true;
  }
}

function onKeyUp(event, change, editor) {
  const emoji = change.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
  if (!emoji) {
    const justTyped = change.value.change().extend(-1).value.fragment.text;
    if (justTyped.trim() === ':') {
      change.addMark({ type: EMOJI_TYPING_TYPE, data: { typed: '', suggestions: [], picked: '' } });
    }
    return;
  }

  if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
    let typed = '';
    const tmp = change.value.change();
    while (true) {
      tmp.extend(-1);
      if (typed === tmp.value.fragment.text) {
        break;
      }
      typed = tmp.value.fragment.text;
      if (typed.startsWith(':')) {
        break;
      }
    }
    if (typed.length > 10 || !typed.startsWith(':')) {
      change.removeMark(emoji);
      return;
    }
    let suggestions = [];
    let picked = emoji.data.get('picked');

    if (typed.length >= 3) {
      const typedEmoji = typed.replace(':', '');
      const isNumeric = `${Number(typedEmoji)}` === typedEmoji;
      if (!isNumeric || typedEmoji.length >= 3) {
        suggestions = getEmojiSuggestions(typedEmoji);
        const pickedIdx = suggestions.indexOf(picked);
        picked = suggestions[pickedIdx === -1 ? 0 : pickedIdx];
      }
    }
    updateEmojiMark(change, emoji, { typed, suggestions, picked });
  }
}

const ToolbarEmojiButton = ({ value, onChange }) => {
  const onInsertEmoji = name => {
    const inline = {
      object: 'inline',
      type: EMOJI_TYPE,
      isVoid: true,
      data: { name },
    };
    Actions.closePopover();
    setTimeout(() => {
      onChange(
        value
          .change()
          .insertInline(inline)
          .collapseToStartOfNextText()
          .focus()
      );
    }, 100);
  };

  return (
    <button
      onClick={e => {
        Actions.openPopover(<EmojiToolbarPopover onInsertEmoji={onInsertEmoji} />, {
          originRect: (e.target as HTMLElement).getBoundingClientRect(),
          direction: 'up',
        });
      }}
    >
      <i className="fa fa-smile-o" />
    </button>
  );
};

export default [
  {
    toolbarComponents: [ToolbarEmojiButton],
    topLevelComponent: FloatingEmojiPicker,
    renderMark,
    renderNode,
    rules,
    onKeyDown,
    onKeyUp,
  },
];
