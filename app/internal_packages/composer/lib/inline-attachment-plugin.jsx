import React from 'react';
import { AttachmentStore } from 'mailspring-exports';
import { ImageAttachmentItem } from 'mailspring-component-kit';

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
    const { fileId } = entity.getData();
    const { draft } = getExposedProps();
    const file = draft.files.find(u => fileId === u.id);

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
        const entity = contentState.getEntity(block.getEntityAt(0));
        const type = entity.getType();
        if (type === 'image') {
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
