import React from 'react';
import SoftBreak from 'slate-soft-break';
import EditList from 'slate-edit-list';
import AutoReplace from 'slate-auto-replace';

import { DEFAULT_FONT_SIZE } from './base-mark-plugins';
import { BuildToggleButton } from './toolbar-component-factories';

function nodeIsEmpty(node) {
  if (node.text !== '') {
    return false;
  }

  let children = (node.nodes.toArray ? node.nodes.toArray() : node.nodes) || [];
  if (children.length === 0) {
    return true;
  }
  if (children.length === 1 && children[0].object === 'text') {
    return true;
  }
  return false;
}

export const BLOCK_CONFIG = {
  div: {
    type: 'div',
    tagNames: ['div', 'br', 'p'],
    render: ({ node, attributes, children, targetIsHTML }) => {
      if (targetIsHTML && nodeIsEmpty(node)) {
        return <br {...attributes} />;
      }
      return (
        <div
          {...attributes}
          style={{ fontSize: DEFAULT_FONT_SIZE }}
          className={node.data.className || node.data.get('className')}
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
      isActive: value => value.focusBlock && value.focusBlock.type === BLOCK_CONFIG.blockquote.type,
      onToggle: (value, active) =>
        active
          ? value.change().setBlock(BLOCK_CONFIG.div.type)
          : value.change().setBlock(BLOCK_CONFIG.blockquote.type),
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
      onToggle: (value, active) =>
        active
          ? value.change().setBlock(BLOCK_CONFIG.div.type)
          : value.change().setBlock(BLOCK_CONFIG.code.type),
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
      onToggle: (value, active) =>
        active
          ? EditListPlugin.changes.unwrapList(value.change())
          : EditListPlugin.changes.wrapInList(value.change(), BLOCK_CONFIG.ol_list.type),
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
      onToggle: (value, active) =>
        active
          ? EditListPlugin.changes.unwrapList(value.change())
          : EditListPlugin.changes.wrapInList(value.change(), BLOCK_CONFIG.ul_list.type),
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

const EditListPlugin = new EditList({
  types: [BLOCK_CONFIG.ol_list.type, BLOCK_CONFIG.ul_list.type],
  typeItem: BLOCK_CONFIG.list_item.type,
  typeDefault: BLOCK_CONFIG.div.type,
});

function renderNode(props) {
  const config = BLOCK_CONFIG[props.node.type];
  return config && config.render(props);
}

function onKeyDown(event, change, editor) {
  const focusBlock = change.value.focusBlock;

  if (process.platform === 'darwin' ? event.metaKey : event.ctrlKey) {
    // indent / outdent from quoted text
    if (event.key === ']' && focusBlock && focusBlock.type === BLOCK_CONFIG.div.type) {
      change.setBlock(BLOCK_CONFIG.blockquote.type);
    }
    if (event.key === '[' && focusBlock && focusBlock.type === BLOCK_CONFIG.blockquote.type) {
      change.setBlock(BLOCK_CONFIG.div.type);
    }
  }
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

      // return block
      if (config) {
        return {
          object: 'block',
          type: config.type,
          nodes: next(el.childNodes),
          data: {
            className: el.getAttribute('class'),
          },
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

export function hasBlockquote(value) {
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

export function hasNonTrailingBlockquote(value) {
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

export function allNodesInBFSOrder(value) {
  const all = [];
  const collect = node => {
    if (!node.nodes) return;
    all.push(node);
    node.nodes.toArray().forEach(collect);
  };
  collect(value.document);
  return all;
}

export function lastUnquotedNode(value) {
  const all = allNodesInBFSOrder(value);
  for (let idx = 0; idx < all.length; idx++) {
    const n = all[idx];
    if (
      n.type === 'blockquote' ||
      (n.data && n.data.get('className') && n.data.get('className').includes('gmail_quote'))
    ) {
      return all[Math.max(0, idx - 1)];
    }
  }
  return all[0];
}

export function hideQuotedTextByDefault(draft) {
  if (draft.isForwarded()) {
    return false;
  }
  if (hasNonTrailingBlockquote(draft.bodyEditorState)) {
    return false;
  }
  return true;
}

// plugins

export default [
  {
    toolbarComponents: Object.values(BLOCK_CONFIG)
      .filter(config => config.button)
      .map(BuildToggleButton),
    renderNode,
    onKeyDown,
    rules,
  },
  SoftBreak({
    onlyIn: [BLOCK_CONFIG.code.type],
  }),
  EditListPlugin,
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type, BLOCK_CONFIG.div.type],
    trigger: ' ',
    before: /^([-]{1})$/,
    transform: (transform, e, matches) => {
      EditListPlugin.changes.wrapInList(transform, BLOCK_CONFIG.ul_list.type);
    },
  }),
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type, BLOCK_CONFIG.div.type],
    trigger: ' ',
    before: /^([1]{1}[.]{1})$/,
    transform: (transform, e, matches) => {
      EditListPlugin.changes.wrapInList(transform, BLOCK_CONFIG.ol_list.type);
    },
  }),
];
