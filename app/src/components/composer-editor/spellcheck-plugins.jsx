import React from 'react';
import { Range } from 'slate';

import { BLOCK_CONFIG } from './base-block-plugins';
import { LINK_TYPE } from './link-plugins';
import { VARIABLE_TYPE } from './template-plugins';
import { MARK_CONFIG } from './base-mark-plugins';

/* Why not use the spellchecking built-in to Slate? It falls through to the
native spellcheck APIs (which we also customize for the rest of the app), but
for some reason it's /really/ slow. Like... typing is visibly slower slow.
I have a hunch this is because Slate re-assigns selection often, and thus
triggers spellchecking 3-4x more than it should.

By doing this ourselves using the decorator API, we can:

- Spellcheck only the currently focused node as the user types.
- After a debounce:
  + Re-infer the spellcheck language 
  + Spellcheck the entire document
*/

const MISSPELLED_TYPE = 'misspelled';

// For speed, we bail after we've found (about) this many misspellings
const MAX_MISPELLINGS = 10;

// For now, we hardcode a set of block types we don't traverse in to, and
// marks that indicate text shouldn't be spellchecked. Not sure how to share
// these block/mark "attributes" between plugins.
const EXCEPT_BLOCK_TYPES = [BLOCK_CONFIG.blockquote.type, BLOCK_CONFIG.code.type];
const EXCEPT_MARK_TYPES = [MARK_CONFIG.codeInline.type, LINK_TYPE, VARIABLE_TYPE];

function renderMark(props) {
  const { children, mark } = props;
  if (mark.type === MISSPELLED_TYPE) {
    return (
      <span
        onMouseDown={event => {
          // handle only ctrl click or right click (button = 2)
          if (!event.metaKey && !event.ctrlKey && event.button !== 2) {
            return;
          }
          event.preventDefault();
          // select the entire word so that the contextual menu offers spelling suggestions
          const { editor: { onChange, value }, node, offset, text } = props;
          onChange(
            value.change().select(
              Range.create({
                anchorKey: node.key,
                anchorOffset: offset,
                focusKey: node.key,
                focusOffset: offset + text.length,
                isFocused: true,
              })
            )
          );
        }}
        style={{
          backgroundImage: 'linear-gradient(to left, red 40%, rgba(255, 255, 255, 0) 0%)',
          backgroundPosition: 'bottom',
          backgroundSize: '5px 1.3px',
          backgroundRepeat: 'repeat-x',
        }}
      >
        {children}
      </span>
    );
  }
}

function decorationsForNode(node, value) {
  const { key, text } = node;
  const regexp = /([^\s.,¿?!:()[\]+><"“”|*&^%$#@—-]+)/g;
  const decorations = [];
  let match = null;

  const isFocused = node.key === value.focusKey;

  while ((match = regexp.exec(text))) {
    // If this word contains the insertion point don't mark it as misspelled.
    if (
      isFocused &&
      match.index <= value.focusOffset &&
      match.index + match[0].length >= value.focusOffset
    ) {
      continue;
    }

    if (AppEnv.spellchecker.isMisspelled(match[0])) {
      const range = Range.create({
        anchorKey: key,
        anchorOffset: match.index,
        focusKey: key,
        focusOffset: match.index + match[0].length,
        marks: [{ type: MISSPELLED_TYPE }],
      });

      // If this text range has marks (it's part of a link, template variable,
      // inline code fragment, etc.) don't mark it as misspelled.
      if (value.document.getMarksAtRange(range).find(m => EXCEPT_MARK_TYPES.includes(m.type))) {
        continue;
      }

      // If this word is "isn" of isn't or the "inz" of "y'inz", don't mark it
      if (text[match[0].length + 1] === "'" || text[match.index - 1] === "'") {
        continue;
      }

      // If the word starts with a capital letter (name / acronym), don't mark it
      if (match[0][0].toLocaleLowerCase() !== match[0][0]) {
        continue;
      }

      decorations.push(range);
      if (decorations.length > MAX_MISPELLINGS) {
        break;
      }
    }
  }

  return decorations;
}

function collectSpellcheckableTextNodes(node) {
  if (node.object === 'block' && EXCEPT_BLOCK_TYPES.includes(node.type)) {
    return [];
  }
  const array = [];
  node.nodes.forEach(node => {
    if (node.object === 'text') {
      array.push(node);
    } else {
      array.push(...collectSpellcheckableTextNodes(node));
    }
  });
  return array;
}

function onSpellcheckFocusedNode(change) {
  const { value } = change;
  const decorations = value.get('decorations') || [];
  if (!value.focusKey) {
    return;
  }

  const next = [];

  // spellcheck the text nodes of the focused block
  const texts = collectSpellcheckableTextNodes(value.focusBlock);
  const scannedNodeKeys = {};
  for (const node of texts) {
    scannedNodeKeys[node.key] = true;
    next.push(...decorationsForNode(node, value));
    if (decorations.length > MAX_MISPELLINGS) {
      break;
    }
  }

  // add the decorations already in nodes we didn't visit
  decorations.forEach(d => {
    if (!scannedNodeKeys[d.focusKey]) {
      next.push(d);
    }
  });

  change
    .setOperationFlag('save', false)
    .setValue({ decorations: next })
    .setOperationFlag('save', true);
}

function onSpellcheckFullDocument(editor) {
  const { value } = editor;

  // re-determine the language the document is written in
  if (value.focusBlock) {
    const text = value.focusBlock.text;
    if (text.length > 80) {
      AppEnv.spellchecker.provideHintText(text.substr(text.length - 512, 512));
    }
  }

  // spellcheck all text nodes
  const texts = collectSpellcheckableTextNodes(value.document);
  const decorations = [];
  for (const node of texts) {
    decorations.push(...decorationsForNode(node, value));
    if (decorations.length > MAX_MISPELLINGS) {
      break;
    }
  }

  // compare old decorations to new decorations. We're debounced, so calling
  // onChange() introduces a re-render we wouldn't be doing otherwise.
  let changed = false;
  const previous = value.get('decorations');

  if (!previous || previous.size !== decorations.length) {
    changed = true;
  } else {
    const table = {};
    previous.forEach(
      d => (table[`${d.anchorKey}:${d.anchorOffset}-${d.focusKey}:${d.focusOffset}`] = true)
    );
    for (const d of decorations) {
      if (!table[`${d.anchorKey}:${d.anchorOffset}-${d.focusKey}:${d.focusOffset}`]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    const change = value
      .change()
      .setOperationFlag('save', false)
      .setValue({ decorations })
      .setOperationFlag('save', true);
    editor.onChange(change);
  }
}

let timer = null;
let timerStart = Date.now();

function onChange(change, editor) {
  if (!AppEnv.config.get('core.composing.spellcheck')) {
    return;
  }
  const now = Date.now();
  if (timer && now - timerStart < 200) {
    return;
  }
  if (editor.state.isComposing) {
    return;
  }

  timerStart = now;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => onSpellcheckFullDocument(editor), 1000);
}
function onKeyUp(event, change){
  if (!['Space', ' ', 'Tab'].includes(event.key)) {
    return;
  }
  // DC-1046 We moved from onChange because for some reason, this is causing direction key to not work when
  // attachment is part of draft.
  // We use onKeyUp because using onKeyDown will set last word as focused, which our spellchecker will ignore
  onSpellcheckFocusedNode(change);
}

export default [
  {
    onChange,
    onKeyUp,
    renderMark,
    rules: [],
  },
];
