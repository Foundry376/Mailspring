import React from 'react';
import { AtomicBlockUtils, EditorState } from 'draft-js';

const ENTITY_TYPE = 'UNEDITABLEQUOTE';

export function quoteDepthForNode(node) {
  let n = node;
  let depth = 0;

  while (n) {
    if (n.nodeName === 'BLOCKQUOTE') {
      depth += 1;
    }
    n = n.parentNode;
  }

  console.log(depth);
  return depth;
}

export const HTMLConfig = {
  htmlToBlock(nodeName, node) {
    if (node.nodeName === 'blockquote' && node.classList.contains('gmail_quote')) {
      return {
        type: 'BLOCKQUOTE',
        data: {},
      };
    }
  },
  htmlToStyle(nodeName, node, currentStyle) {
    if (nodeName === 'blockquote') {
      return currentStyle.add(`QUOTELEVEL:${quoteDepthForNode(node)}`);
    }
    return currentStyle;
  },
};

const createQuotedTextPlugin = () => {
  return {
    customStyleFn: style => {
      const ql = style.filter(k => k.startsWith('QUOTELEVEL')).last();
      if (ql) {
        console.log(ql);
        return {
          display: 'block',
          borderLeft: '3px solid red',
          paddingLeft: ql.split(':').pop() / 1 * 10,
        };
      }
    },
  };
};

export default createQuotedTextPlugin;
