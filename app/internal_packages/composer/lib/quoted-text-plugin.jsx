import React from 'react';
import { AtomicBlockUtils, EditorState } from 'draft-js';

const ENTITY_TYPE = 'UNEDITABLEQUOTE';

export const HTMLConfig = {
  htmlToBlock(nodeName, node) {
    if (node.nodeName === 'blockquote' && node.classList.contains('gmail_quote')) {
      return {
        type: 'BLOCKQUOTE',
        data: {},
      };
    }
  },
};

const createQuotedTextPlugin = () => {
  return {
    blockRendererFn: (block, { getEditorState }) => {
      // if (block.getType() === 'atomic') {
      //   const contentState = getEditorState().getCurrentContent();
      //   const entityKey = block.getEntityAt(0);
      //   if (!entityKey) return null;

      //   const entity = contentState.getEntity(entityKey);
      //   if (!entity) return null;

      //   const type = entity.getType();
      //   if (type === ENTITY_TYPE) {
      //     return {
      //       component,
      //       editable: false,
      //     };
      //   }
      // }
      // return null;mic') {
      //   const contentState = getEditorState().getCurrentContent();
      //   const entityKey = block.getEntityAt(0);
      //   if (!entityKey) return null;

      //   const entity = contentState.getEntity(entityKey);
      //   if (!entity) return null;

      //   const type = entity.getType();
      //   if (type === ENTITY_TYPE) {
      //     return {
      //       component,
      //       editable: false,
      //     };
      //   }
      // }
      return null;
    },
  };
};

export default createQuotedTextPlugin;
