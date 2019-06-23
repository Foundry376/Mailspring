import React from 'react';
import { Editor, Value, Node } from 'slate';
import SoftBreak from 'slate-soft-break';
import EditList from '@bengotow/slate-edit-list';
import AutoReplace from 'slate-auto-replace';
import When from 'slate-when';

import { MessageWithEditorState } from 'mailspring-exports';
import { BuildToggleButton, IEditorToolbarConfigItem } from './toolbar-component-factories';
import { ComposerEditorPlugin } from './types';

function nodeIsEmpty(node: Node) {
  if (node.text !== '') {
    return false;
  }

  if (node.object !== 'text') {
    let children = ((node.nodes.toArray ? node.nodes.toArray() : node.nodes) || []) as any;
    if (children.length === 0) {
      return true;
    }
    if (children.length === 1 && children[0].object === 'text') {
      return true;
    }
  }
  return false;
}

function isBlockTypeOrWithinType(value: Value, type: string) {
  if (!value.focusBlock) {
    return false;
  }
  const isMe = value.focusBlock.type === type;
  const isParent = value.document
    .getAncestors(value.focusBlock.key)
    .find(b => b.object === 'block' && b.type === type);

  return !!(isMe || isParent);
}

function toggleBlockTypeWithBreakout(editor: Editor, type) {
  if (!editor.value.focusBlock) return;

  const ancestors = editor.value.document.getAncestors(editor.value.focusBlock.key);

  let idx = ancestors.findIndex(b => b.object === 'block' && b.type === type);
  if (idx === -1 && editor.value.focusBlock.type === type) {
    idx = ancestors.size - 1;
  }

  if (idx !== -1) {
    const depth = ancestors.size - idx;
    if (depth > 0) {
      editor.splitBlock(ancestors.size - idx);
      for (let x = 0; x < depth; x++) editor.unwrapBlock({ type });
    }
    editor.setBlocks(BLOCK_CONFIG.div.type);
  } else {
    editor.setBlocks(type);
  }
}

export const BLOCK_CONFIG: {
  [key: string]: IEditorToolbarConfigItem;
} = {
  div: {
    type: 'div',
    tagNames: ['div', 'br', 'p'],
    render: ({ node, attributes, children, targetIsHTML }) => {
      let explicitHTMLAttributes = undefined;

      if (targetIsHTML) {
        explicitHTMLAttributes = {};
        if (node.isLeafBlock() && node.getTextDirection() === 'rtl') {
          explicitHTMLAttributes.dir = 'rtl';
        }
      }

      if (targetIsHTML && nodeIsEmpty(node)) {
        return <br {...attributes} />;
      }
      return (
        <div
          {...attributes}
          {...explicitHTMLAttributes}
          className={node.data['className'] || node.data.get('className')}
        >
          {children}
        </div>
      );
    },
  },
  blockquote: {
    type: 'blockquote',
    tagNames: ['blockquote'],
    render: props => <blockquote {...props.attributes}>{props.children}</blockquote>,
    button: {
      iconClass: 'fa fa-quote-left',
      isActive: value => {
        return isBlockTypeOrWithinType(value, BLOCK_CONFIG.blockquote.type);
      },
      onToggle: (editor: Editor, active) => {
        return toggleBlockTypeWithBreakout(editor, BLOCK_CONFIG.blockquote.type);
      },
    },
  },
  code: {
    type: 'code',
    tagNames: ['pre'],
    render: props => (
      <code {...props.attributes}>
        <pre
          style={{
            backgroundColor: `rgba(0,0,0,0.05)`,
            padding: `0.2em 1em`,
          }}
        >
          {props.children}
        </pre>
      </code>
    ),
    button: {
      isActive: value => value.focusBlock && value.focusBlock.type === BLOCK_CONFIG.code.type,
      iconClass: 'fa fa-sticky-note-o',
      onToggle: (editor, active) => {
        if (active) {
          return editor.setBlocks(BLOCK_CONFIG.div.type);
        } else if (editor.value.selection.isCollapsed) {
          return editor.setBlocks(BLOCK_CONFIG.code.type);
        } else {
          const value = editor.value;
          // Collect all the text fragments which are being converted to a code block
          let texts = value.document
            .getTextsAtRange(value.selection as any)
            .toArray()
            .map(t => {
              if (t.key === value.selection.anchor.key) {
                return value.selection.isBackward
                  ? t.text.substr(0, value.selection.anchor.offset)
                  : t.text.substr(value.selection.anchor.offset);
              } else if (t.key === value.selection.focus.key) {
                return value.selection.isBackward
                  ? t.text.substr(value.selection.focus.offset)
                  : t.text.substr(0, value.selection.focus.offset);
              } else {
                return t.text;
              }
            });

          if (texts[0] === '') {
            texts.shift();
          }
          if (texts[texts.length - 1] === '') {
            texts.pop();
          }
          // Remove leading spaces that are present on every line
          let minLeadingSpaces = 1000;
          texts
            .filter(text => text.trim().length > 0)
            .forEach(text => {
              const match = /^ +/.exec(text);
              if (match === null) {
                minLeadingSpaces = 0;
              } else {
                minLeadingSpaces = Math.min(minLeadingSpaces, match[0].length);
              }
            });
          // Join the text blocks together into a single string
          const text = texts.map(t => t.substr(minLeadingSpaces)).join('\n');

          // Delete the selection and insert a single code block with the text
          return editor
            .delete()
            .insertBlock(BLOCK_CONFIG.code.type)
            .insertText(text)
            .insertBlock(BLOCK_CONFIG.div.type);
        }
      },
    },
  },
  ol_list: {
    type: 'ol_list',
    tagNames: ['ol'],
    render: props => <ol {...props.attributes}>{props.children}</ol>,
    button: {
      iconClass: 'fa fa-list-ol',
      isActive: value => {
        const list = EditListPlugin.utils.getCurrentList(value);
        return list && list.type === BLOCK_CONFIG.ol_list.type;
      },
      onToggle: (editor: Editor, active) =>
        active
          ? EditListPlugin.changes.unwrapList(editor)
          : EditListPlugin.changes.wrapInList(editor, BLOCK_CONFIG.ol_list.type),
    },
  },
  ul_list: {
    type: 'ul_list',
    tagNames: ['ul'],
    render: props => <ul {...props.attributes}>{props.children}</ul>,
    button: {
      iconClass: 'fa fa-list-ul',
      isActive: value => {
        const list = EditListPlugin.utils.getCurrentList(value);
        return list && list.type === BLOCK_CONFIG.ul_list.type;
      },
      onToggle: (editor: Editor, active) =>
        active
          ? EditListPlugin.changes.unwrapList(editor)
          : EditListPlugin.changes.wrapInList(editor, BLOCK_CONFIG.ul_list.type),
    },
  },
  list_item: {
    type: 'list_item',
    tagNames: ['li'],
    render: props => <li {...props.attributes}>{props.children}</li>,
  },
  heading_one: {
    type: 'heading_one',
    tagNames: ['h1'],
    render: props => <h1 {...props.attributes}>{props.children}</h1>,
  },
  heading_two: {
    type: 'heading_two',
    tagNames: ['h2'],
    render: props => <h2 {...props.attributes}>{props.children}</h2>,
  },
};

export const EditListPlugin = new EditList({
  types: [BLOCK_CONFIG.ol_list.type, BLOCK_CONFIG.ul_list.type],
  typeItem: BLOCK_CONFIG.list_item.type,
  typeDefault: BLOCK_CONFIG.div.type,
});

function renderNode(props, editor: Editor = null, next = () => {}) {
  const config = BLOCK_CONFIG[props.node.type];
  return config ? config.render(props) : next();
}

const rules = [
  {
    deserialize(el, next) {
      const tagName = el.tagName.toLowerCase();
      let config = Object.values(BLOCK_CONFIG).find(c => c.tagNames.includes(tagName));

      // apply a few special rules:
      // block elements with monospace font are translated to <code> blocks
      if (
        ['div', 'blockquote'].includes(tagName) &&
        (el.style.fontFamily || el.style.font || '').includes('monospace')
      ) {
        config = BLOCK_CONFIG.code;
      }

      // div elements that are entirely empty and have no meaningful-looking styles applied
      // would probably just add extra whitespace
      let empty = !el.hasChildNodes();
      if (tagName === 'div' && empty) {
        const s = (el.getAttribute('style') || '').toLowerCase();
        if (!s.includes('background') && !s.includes('margin') && !s.includes('padding')) {
          return;
        }
      }

      // return block
      if (config) {
        const className = el.getAttribute('class');
        const data = className ? { className } : undefined;
        return {
          object: 'block',
          type: config.type,
          nodes: next(el.childNodes),
          data: data,
        };
      }
    },
    serialize(obj, children) {
      if (obj.object !== 'block') return;
      return renderNode({ node: obj, children, targetIsHTML: true });
    },
  },
];

// support functions

export function hasBlockquote(value: Value) {
  const nodeHasBlockquote = node => {
    if (!node.nodes) return false;
    for (const childNode of node.nodes.toArray()) {
      if (childNode.type === BLOCK_CONFIG.blockquote.type || nodeHasBlockquote(childNode)) {
        return true;
      }
    }
  };
  return nodeHasBlockquote(value.document);
}

export function hasNonTrailingBlockquote(value: Value) {
  const nodeHasNonTrailingBlockquote = node => {
    if (!node.nodes) return false;
    let found = false;
    for (const block of node.nodes.toArray()) {
      if (block.type === BLOCK_CONFIG.blockquote.type) {
        found = true;
      } else if (found && block.text.length > 0) {
        return true;
      } else if (nodeHasNonTrailingBlockquote(block)) {
        return true;
      }
    }
  };
  return nodeHasNonTrailingBlockquote(value.document);
}

export function allNodesInBFSOrder(value: Value) {
  const all = [];
  const collect = node => {
    if (!node.nodes) return;
    all.push(node);
    node.nodes.toArray().forEach(collect);
  };
  collect(value.document);
  return all;
}

export function isQuoteNode(n: Node) {
  return (
    n.object === 'block' &&
    (n.type === 'blockquote' ||
      (n.data && n.data.get('className') && n.data.get('className').includes('gmail_quote')))
  );
}

export function lastUnquotedNode(value: Value) {
  const all = allNodesInBFSOrder(value);
  for (let idx = 0; idx < all.length; idx++) {
    const n = all[idx];
    if (isQuoteNode(n)) {
      return all[Math.max(0, idx - 1)];
    }
  }
  return all[0];
}

export function removeQuotedText(editor: Editor) {
  let quoteBlock = null;
  while ((quoteBlock = allNodesInBFSOrder(editor.value).find(isQuoteNode))) {
    editor.removeNodeByKey(quoteBlock.key);
  }
}

export function hideQuotedTextByDefault(draft: MessageWithEditorState) {
  if (draft.isForwarded()) {
    return false;
  }
  if (hasNonTrailingBlockquote(draft.bodyEditorState)) {
    return false;
  }
  return true;
}

// plugins

const MailspringBaseBlockPlugin: ComposerEditorPlugin = {
  toolbarComponents: Object.values(BLOCK_CONFIG)
    .filter(config => config.button)
    .map(BuildToggleButton),
  renderNode,
  commands: {
    'contenteditable:quote': (event, editor: Editor) => {
      const { isActive, onToggle } = BLOCK_CONFIG.blockquote.button;
      return onToggle(editor, isActive(editor.value));
    },
    'contenteditable:numbered-list': (event, editor: Editor) => {
      const { isActive, onToggle } = BLOCK_CONFIG.ol_list.button;
      return onToggle(editor, isActive(editor.value));
    },
    'contenteditable:bulleted-list': (event, editor: Editor) => {
      const { isActive, onToggle } = BLOCK_CONFIG.ul_list.button;
      return onToggle(editor, isActive(editor.value));
    },
    'contenteditable:indent': (event, editor: Editor) => {
      const focusBlock = editor.value.focusBlock;
      if (focusBlock && focusBlock.type === BLOCK_CONFIG.div.type) {
        return editor.setBlocks(BLOCK_CONFIG.blockquote.type);
      }
    },
    'contenteditable:outdent': (event, editor: Editor) => {
      const focusBlock = editor.value.focusBlock;
      if (focusBlock && focusBlock.type === BLOCK_CONFIG.blockquote.type) {
        return editor.setBlocks(BLOCK_CONFIG.div.type);
      }
    },
  },
  rules,
};

const plugins: ComposerEditorPlugin[] = [
  // Base implementation of BLOCK_CONFIG block types,
  // the "block" toolbar section, and serialization
  MailspringBaseBlockPlugin,

  // Return creates soft newlines in code blocks
  When({
    when: value => value.blocks.some(b => b.type === BLOCK_CONFIG.code.type),
    plugin: SoftBreak(),
  }),

  // Pressing backspace when you're at the top of the document should not delete down
  {
    onKeyDown: function onKeyDown(event, editor: Editor, next: () => void) {
      if (event.key !== 'Backspace' || event.shiftKey || event.metaKey || event.optionKey) {
        return next();
      }
      const { selection, focusText, document } = editor.value;
      const firstText = document.getFirstText();
      if (
        selection.isCollapsed &&
        selection.focus &&
        selection.focus.offset === 0 &&
        focusText &&
        firstText &&
        firstText.key === focusText.key
      ) {
        event.preventDefault();
        return;
      } else {
        return next();
      }
    },
  },

  // Return breaks you out of blockquotes completely
  {
    onKeyDown: function onKeyDown(event, editor: Editor, next: () => void) {
      if (event.shiftKey) {
        return next();
      }
      if (event.key !== 'Enter') {
        return next();
      }
      if (!isBlockTypeOrWithinType(editor.value, BLOCK_CONFIG.blockquote.type)) {
        return next();
      }
      toggleBlockTypeWithBreakout(editor, BLOCK_CONFIG.blockquote.type);
      event.preventDefault(); // since this inserts a newline
    },
  },

  // Tabbing in / out in lists, enter to start new list item
  EditListPlugin,

  // "1. " and "- " start new lists
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type, BLOCK_CONFIG.div.type],
    trigger: ' ',
    before: /^([-]{1})$/,
    change: (transform, e, matches) => {
      EditListPlugin.changes.wrapInList(transform, BLOCK_CONFIG.ul_list.type);
    },
  }),
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type, BLOCK_CONFIG.div.type],
    trigger: ' ',
    before: /^([1]{1}[.]{1})$/,
    change: (transform, e, matches) => {
      EditListPlugin.changes.wrapInList(transform, BLOCK_CONFIG.ol_list.type);
    },
  }),
];

export default plugins;
