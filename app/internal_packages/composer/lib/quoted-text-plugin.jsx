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
  return depth;
}

export const HTMLConfig = {
  htmlToEntity(nodeName, node, createEntity) {
    const isDeepBlockquote =
      node.nodeName === 'BLOCKQUOTE' && node.innerText.trim().length && quoteDepthForNode(node) > 1;

    if (isDeepBlockquote) {
      const quotedHTML = node.innerHTML;
      node.innerHTML = ' ';
      return createEntity(ENTITY_TYPE, 'IMMUTABLE', { quotedHTML });
    }

    const isUneditable = node.nodeName === 'TABLE';
    if (isUneditable) {
      const outerHTML = node.outerHTML;
      node.innerHTML = ' ';
      return createEntity(ENTITY_TYPE, 'IMMUTABLE', { outerHTML });
    }
  },

  entityToHTML(entity, originalText) {
    if (entity.type === ENTITY_TYPE) {
      const quotedHTML = entity.data.quotedHTML;
      if (quotedHTML) {
        return {
          empty: `<blockquote class="gmail_quote">${quotedHTML}</blockquote>`,
          start: `<blockquote class="gmail_quote">${quotedHTML}</blockquote>`,
          end: '',
        };
      }
      const outerHTML = entity.data.outerHTML;
      if (outerHTML) {
        return {
          empty: outerHTML,
          start: outerHTML,
          end: '',
        };
      }
    }
  },
};

function findEntities(contentBlock, callback, contentState) {
  contentBlock.findEntityRanges(character => {
    const entityKey = character.getEntity();
    if (!entityKey) return;

    const entity = contentState.getEntity(entityKey);
    return entity.getType() === ENTITY_TYPE;
  }, callback);
}

const createQuotedTextPlugin = () => {
  return {
    decorators: [
      {
        strategy: findEntities,
        component: props => {
          const { quotedHTML, outerHTML } = props.contentState.getEntity(props.entityKey).getData();

          if (outerHTML) {
            return {
              editable: false,
              component: props => {
                return (
                  <div className="uneditable" dangerouslySetInnerHTML={{ __html: outerHTML }} />
                );
              },
            };
          }
          return (
            <blockquote className="uneditable" dangerouslySetInnerHTML={{ __html: quotedHTML }} />
          );
        },
      },
    ],
  };
};

export default createQuotedTextPlugin;
