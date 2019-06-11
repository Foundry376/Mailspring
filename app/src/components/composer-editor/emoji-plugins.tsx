import React from 'react';
import NodeEmoji from 'node-emoji';
import { Actions } from 'mailspring-exports';
import { Editor, Mark } from 'slate';
import { Rule, ComposerEditorPlugin, ComposerEditorPluginTopLevelComponentProps } from './types';
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
export function getEmojiSuggestions(word: string) {
  const emojiOptions = [];
  const emojiNames = Object.keys(NodeEmoji.emoji).sort();
  for (const emojiName of emojiNames) {
    if (word === emojiName.substring(0, word.length)) {
      emojiOptions.push(emojiName);
    }
  }
  return emojiOptions;
}

export function getEmojiImagePath(emojiname: string) {
  EmojiNameToImageTable = EmojiNameToImageTable || require('./emoji-name-to-image-table');
  return process.platform === 'darwin'
    ? `images/composer-emoji/apple/${EmojiNameToImageTable[emojiname]}`
    : `images/composer-emoji/twitter/${EmojiNameToImageTable[emojiname]}`;
}

function ImageBasedEmoji(props: { name: string }) {
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
function FloatingEmojiPicker({ editor, value }: ComposerEditorPluginTopLevelComponentProps) {
  if (!value.selection.isFocused) return null;
  const sel = document.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);

  const emoji = value.activeMarks.find(i => i.type === EMOJI_TYPING_TYPE);
  if (!emoji) return null;

  const picked = emoji.data.get('picked');
  const suggestions = emoji.data.get('suggestions');
  if (!suggestions || !suggestions.length) return null;

  const target = range.endContainer.parentElement.closest('[data-emoji-typing]');
  if (!target) return null;

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
          onMouseDown={e => swapEmojiMarkFor(editor, emoji, option)}
          className={`btn btn-icon ${picked === option && 'emoji-option'}`}
        >
          <ImageBasedEmoji name={option} /> :{option}
        </button>
      ))}
    </div>
  );
}

function renderNode(
  {
    node,
    attributes,
    children,
    targetIsHTML,
  }: {
    node?: any;
    attributes?: any;
    children: any;
    targetIsHTML?: boolean;
  },
  editor: Editor = null,
  next = () => {}
) {
  if (node.type !== EMOJI_TYPE) {
    return next();
  }
  const name = node.data.name || node.data.get('name');
  return (
    <span {...attributes} data-emoji-name={name}>
      {targetIsHTML ? NodeEmoji.get(name) : <ImageBasedEmoji name={name} />}
    </span>
  );
}

function renderMark(
  {
    mark,
    children,
    targetIsHTML,
  }: {
    mark: any;
    children: any;
    targetIsHTML?: boolean;
  },
  editor: Editor = null,
  next = () => {}
) {
  if (mark.type === EMOJI_TYPING_TYPE) {
    return <span data-emoji-typing={true}>{children}</span>;
  }
  return next();
}

const rules: Rule[] = [
  {
    deserialize(el, next) {
      if (el instanceof HTMLElement && el.dataset && el.dataset.emojiName) {
        return {
          type: EMOJI_TYPE,
          object: 'inline',
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

export function swapEmojiMarkFor(editor: Editor, emoji: Mark, picked: string) {
  editor.removeMark(emoji);
  if (picked) {
    editor.moveFocusBackward(emoji.data.get('typed').length);
    editor.delete();
    editor.insertInline({
      object: 'inline',
      type: EMOJI_TYPE,
      data: {
        name: picked,
      },
    });
    editor.moveToStartOfNextText();
    editor.removeMark(emoji);
  }
}

export function updateEmojiMark(editor: Editor, existing, { typed, suggestions, picked }) {
  editor.moveAnchorBackward(typed.length);
  editor.removeMark(existing);
  editor.addMark({
    type: EMOJI_TYPING_TYPE,
    data: { typed, suggestions, picked },
  });
  editor.moveToFocus();
}

function onKeyDown(event, editor: Editor, next: () => void) {
  if ([' ', 'Return', 'Enter'].includes(event.key)) {
    const emoji = editor.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
    if (!emoji) return next();
    const picked = emoji.data.get('picked');
    swapEmojiMarkFor(editor, emoji, picked);
    if (picked) {
      event.preventDefault();
      return;
    }
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const dir = event.key.includes('Down') ? 1 : -1;
    const emoji = editor.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
    if (!emoji) return next();
    const suggestions = emoji.data.get('suggestions');
    const typed = emoji.data.get('typed');
    let picked = emoji.data.get('picked');
    const len = suggestions.length;
    picked = suggestions[(len + suggestions.indexOf(picked) + dir) % len];
    updateEmojiMark(editor, emoji, { typed, suggestions, picked });
    event.preventDefault();
    return;
  }
  return next();
}

function onKeyUp(event, editor: Editor, next: () => void) {
  const emoji = editor.value.marks.find(i => i.type === EMOJI_TYPING_TYPE);
  if (!emoji) {
    const { offset, key } = editor.value.selection.focus;
    const focusText = editor.value.focusText;
    if (focusText && focusText.key === key && focusText.text[offset - 1] === ':') {
      editor.addMark({
        type: EMOJI_TYPING_TYPE,
        data: { typed: '', suggestions: [], picked: '' },
      });
    }
    return next();
  }

  if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
    let typed = '';
    const { offset, key } = editor.value.selection.focus;
    const focusText = editor.value.focusText;
    if (focusText.key === key) {
      typed = focusText.text.substr(focusText.text.lastIndexOf(':', offset), offset);
    }
    if (typed.length > 10 || !typed.startsWith(':')) {
      editor.removeMark(emoji);
      return next();
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
    updateEmojiMark(editor, emoji, { typed, suggestions, picked });
  }
  return next();
}

const ToolbarEmojiButton = ({ value, editor }) => {
  const onInsertEmoji = name => {
    const inline = {
      object: 'inline',
      type: EMOJI_TYPE,
      data: { name },
    };
    Actions.closePopover();
    setTimeout(() => {
      editor
        .insertInline(inline)
        .moveToStartOfNextText()
        .focus();
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

const plugins: ComposerEditorPlugin[] = [
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

export default plugins;
