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
    const isDeepBlockquote =
      node.nodeName === 'BLOCKQUOTE' && node.innerText.trim().length && quoteDepthForNode(node) > 1;
    if (isDeepBlockquote) {
      const quotedHTML = node.innerHTML;
      node.innerHTML = '<div>WASHERE</div>';
      return {
        type: 'atomic',
        data: {
          quotedHTML,
        },
      };
    }

    const isUneditable = node.nodeName === 'TABLE';
    if (isUneditable) {
      const outerHTML = node.outerHTML;
      node.innerHTML = '<div>WASHERE</div>';
      return {
        type: 'atomic',
        data: {
          outerHTML,
        },
      };
    }
  },
  blockToHTML: block => {
    const quotedHTML = block.data.quotedHTML;
    if (quotedHTML) {
      return {
        empty: `<blockquote class="gmail_quote">${quotedHTML}</blockquote>`,
        start: `<blockquote class="gmail_quote">${quotedHTML}</blockquote>`,
        end: '',
      };
    }
    const outerHTML = block.data.outerHTML;
    if (outerHTML) {
      return {
        empty: outerHTML,
        start: outerHTML,
        end: '',
      };
    }
  },
};

const createQuotedTextPlugin = () => {
  return {
    blockRendererFn: (block, { getEditorState }) => {
      if (block.getType() === 'atomic') {
        const quotedHTML = block.getData().get('quotedHTML');
        if (quotedHTML) {
          return {
            editable: false,
            component: props => {
              return (
                <blockquote className="uneditable">
                  <div
                    className="blockquote-layer"
                    dangerouslySetInnerHTML={{ __html: quotedHTML }}
                  />
                </blockquote>
              );
            },
          };
        }

        const outerHTML = block.getData().get('outerHTML');
        if (outerHTML) {
          return {
            editable: false,
            component: props => {
              return <div className="uneditable" dangerouslySetInnerHTML={{ __html: outerHTML }} />;
            },
          };
        }
      }
      return null;
    },
  };
};

export default createQuotedTextPlugin;
