import React from 'react';
import NodeEmoji from 'node-emoji';
import { Actions } from 'mailspring-exports';

import EmojiToolbarPopover from './emoji-toolbar-popover';

let EmojiData = null;

const EMOJI_TYPING_TYPE = 'emojitype';
const EMOJI_TYPE = 'emoji';
const MAX_EMOJI_SUGGESTIONS = 6;

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
  EmojiData = EmojiData || require('./emoji-data').emojiData;
  for (const emoji of EmojiData) {
    if (emoji.short_names.includes(emojiname)) {
      return process.platform === 'darwin'
        ? `images/composer-emoji/apple/${emoji.image}`
        : `images/composer-emoji/twitter/${emoji.image}`;
    }
  }
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

function FloatingEmojiPicker({ value, onChange }) {
  if (!value.selection.isFocused) return false;
  const sel = document.getSelection();
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);

  const emoji = value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
  if (!emoji) return false;
  const picked = emoji.data.get('picked');
  const suggestions = emoji.data.get('suggestions');
  if (!suggestions || !suggestions.length) return false;

  const target = range.endContainer.parentElement.closest('[data-emoji-typing]');
  if (!target) return false;

  const relativePositionedParent = target.closest('.body-field');
  const intrinsicPos = relativePositionedParent.getBoundingClientRect();
  const targetPos = target.getBoundingClientRect();

  if (targetPos.left + 150 > relativePositionedParent.width) {
    targetPos.left = relativePositionedParent.width - 150;
  }

  const delta = {
    top: targetPos.top + targetPos.height - intrinsicPos.top,
    left: targetPos.left - intrinsicPos.left,
  };

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

function renderNode({ node, attributes, children, targetIsHTML }) {
  if (node.type === EMOJI_TYPE) {
    const name = node.data.name || node.data.get('name');
    return (
      <span {...attributes} data-emoji-name={name}>
        {targetIsHTML ? NodeEmoji.get(name) : <ImageBasedEmoji name={name} />}
      </span>
    );
  }
}

function renderMark({ mark, children }) {
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
      suggestions = getEmojiSuggestions(typed.replace(':', ''));
      const pickedIdx = suggestions.indexOf(picked);
      picked = suggestions[pickedIdx === -1 ? 0 : pickedIdx];
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
          originRect: e.target.getBoundingClientRect(),
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
