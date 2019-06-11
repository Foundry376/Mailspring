import React from 'react';
import { Editor, Decoration } from 'slate';

import { BLOCK_CONFIG } from './base-block-plugins';
import { LINK_TYPE } from './link-plugins';
import { VARIABLE_TYPE } from './template-plugins';
import { MARK_CONFIG } from './base-mark-plugins';
import { ComposerEditorPlugin } from './types';

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

const composingWeakmap = new WeakMap();

function renderMark(props, editor: Editor = null, next = () => {}) {
  const { children, mark } = props;
  if (mark.type !== MISSPELLED_TYPE) {
    return next();
  }
  return (
    <span
      onMouseDown={event => {
        // handle only ctrl click or right click (button = 2)
        if (!event.metaKey && !event.ctrlKey && event.button !== 2) {
          return;
        }
        event.preventDefault();
        // select the entire word so that the contextual menu offers spelling suggestions
        const { editor, node, offset, text } = props;
        editor.select({
          anchor: { key: node.key, offset: offset },
          focus: { key: node.key, offset: offset + text.length },
          isFocused: true,
        });
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

function decorationsForNode(node, value) {
  const { key, text } = node;
  const regexp = /([^\s.,¿?!:()[\]+><"“”|*&^%$#@—-]+)/g;
  const decorations = [];
  let match = null;

  const focus = value.selection.focus;
  const isFocused = focus && key === focus.key;

  while ((match = regexp.exec(text))) {
    // If this word contains the insertion point don't mark it as misspelled.
    if (isFocused && match.index <= focus.offset && match.index + match[0].length >= focus.offset) {
      continue;
    }

    if (AppEnv.spellchecker.isMisspelled(match[0])) {
      const range = Decoration.create({
        anchor: { key: key, offset: match.index },
        focus: { key: key, offset: match.index + match[0].length },
        mark: { type: MISSPELLED_TYPE },
      } as any);

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

function onSpellcheckFocusedNode(editor) {
  const { value } = editor;
  const decorations = value.get('decorations') || [];
  const block = value.focusBlock;

  if (!block) {
    return;
  }

  const next = [];

  // spellcheck the text nodes of the focused block
  const texts = collectSpellcheckableTextNodes(block);
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
    if (!scannedNodeKeys[d.focus.key]) {
      next.push(d);
    }
  });

  editor.withoutSaving(() => {
    editor.setDecorations(next);
  });
}

function onSpellcheckFullDocument(editor) {
  const { value } = editor;

  // re-determine the language the document is written in
  if (value.focusBlock) {
    const text = value.focusBlock.text;
    if (text.length > 60) {
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
      d => (table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`] = true)
    );
    for (const d of decorations) {
      if (!table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    editor.withoutSaving(() => {
      editor.setDecorations(decorations);
    });
  }
}

let timer = null;
let timerStart = Date.now();

function onChange(editor: Editor, next: () => void) {
  if (!AppEnv.config.get('core.composing.spellcheck')) {
    return next();
  }
  const now = Date.now();
  if (timer && now - timerStart < 200) {
    return next();
  }
  if (composingWeakmap.get(editor)) {
    return next();
  }
  onSpellcheckFocusedNode(editor);

  timerStart = now;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => onSpellcheckFullDocument(editor), 1000);
  return next();
}

const plugins: ComposerEditorPlugin[] = [
  {
    onChange,
    renderMark,
    rules: [],
    onCompositionStart: (event, editor, next) => {
      const v = composingWeakmap.get(editor) || 0 + 1;
      composingWeakmap.set(editor, v);
      next();
    },
    onCompositionEnd: (event, editor, next) => {
      const v = Math.max(0, (composingWeakmap.get(editor) || 0) - 1);
      composingWeakmap.set(editor, v);
      next();
    },
  },
];

export default plugins;
