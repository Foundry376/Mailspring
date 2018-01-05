import React from 'react';
import { AtomicBlockUtils, EditorState } from 'draft-js';

import { AttachmentStore } from 'mailspring-exports';
import { ImageAttachmentItem } from 'mailspring-component-kit';

const ENTITY_TYPE = 'IMAGE';

export function editorStateInsertingInlineAttachment(editorState, file) {
  const contentState = editorState.getCurrentContent();
  const contentStateWithEntity = contentState.createEntity(ENTITY_TYPE, 'SEGMENTED', {
    contentId: file.contentId,
  });
  const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
  const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
  return AtomicBlockUtils.insertAtomicBlock(newEditorState, entityKey, ' ');
}

export const HTMLConfig = {
  htmlToBlock(nodeName, node) {
    if (nodeName === 'img') {
      return {
        type: 'atomic',
        data: {},
      };
    }
  },

  htmlToEntity(nodeName, node, createEntity) {
    if (nodeName === 'img') {
      return createEntity(ENTITY_TYPE, 'SEGMENTED', {
        contentId: node
          .getAttribute('src')
          .split('cid:')
          .pop(),
      });
    }
  },

  entityToHTML(entity, originalText) {
    if (entity.type === ENTITY_TYPE) {
      return {
        empty: `<img alt="" src="cid:${entity.data.contentId}" />`,
        start: `<img alt="" src="cid:${entity.data.contentId}" />`,
        end: '',
      };
    }
  },
};

const createInlineAttachmentPlugin = ({ decorator, getExposedProps, onRemoveBlockWithKey }) => {
  const InlineImageBlock = ({
    block, // eslint-disable-line no-unused-vars
    blockProps, // eslint-disable-line no-unused-vars
    customStyleMap, // eslint-disable-line no-unused-vars
    customStyleFn, // eslint-disable-line no-unused-vars
    decorator, // eslint-disable-line no-unused-vars
    forceSelection, // eslint-disable-line no-unused-vars
    offsetKey, // eslint-disable-line no-unused-vars
    selection, // eslint-disable-line no-unused-vars
    tree, // eslint-disable-line no-unused-vars
    contentState, // eslint-disable-line no-unused-vars
    style,
    ...elementProps
  }) => {
    const entity = contentState.getEntity(block.getEntityAt(0));
    const { contentId } = entity.getData();
    const { draft } = getExposedProps();
    const file = draft.files.find(f => contentId === f.contentId);

    if (!file) {
      return <span />;
    }

    return (
      <ImageAttachmentItem
        {...elementProps}
        className={`file-upload ${elementProps.className}`}
        draggable={false}
        data-src={`cid:${file.contentId}`}
        filePath={AttachmentStore.pathForFile(file)}
        displayName={file.filename}
        onRemoveAttachment={() => onRemoveBlockWithKey(block.getKey())}
      />
    );
  };

  const component = decorator ? decorator(InlineImageBlock) : InlineImageBlock;

  return {
    blockRendererFn: (block, { getEditorState }) => {
      if (block.getType() === 'atomic') {
        const contentState = getEditorState().getCurrentContent();
        const entityKey = block.getEntityAt(0);
        if (!entityKey) return null;

        const entity = contentState.getEntity(entityKey);
        if (!entity) return null;

        const type = entity.getType();
        if (type === ENTITY_TYPE) {
          return {
            component,
            editable: false,
          };
        }
      }
      return null;
    },
  };
};

export default createInlineAttachmentPlugin;
