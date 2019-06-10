import React from 'react';
import { Utils, Actions, AttachmentStore, Message } from 'mailspring-exports';
import { AttachmentItem, ImageAttachmentItem } from 'mailspring-component-kit';

export const AttachmentsArea: React.FunctionComponent<{ draft: Message }> = props => {
  const { files, headerMessageId } = props.draft;

  return (
    <div className="attachments-area">
      {files
        .filter(f => !Utils.shouldDisplayAsImage(f))
        .map(file => (
          <AttachmentItem
            key={file.id}
            className="file-upload"
            draggable={false}
            filePath={AttachmentStore.pathForFile(file)}
            displayName={file.filename}
            fileIconName={`file-${file.displayExtension()}.png`}
            onRemoveAttachment={() => Actions.removeAttachment(headerMessageId, file)}
          />
        ))}
      {files
        .filter(f => Utils.shouldDisplayAsImage(f))
        .filter(f => !f.contentId)
        .map(file => (
          <ImageAttachmentItem
            key={file.id}
            draggable={false}
            className="file-upload"
            filePath={AttachmentStore.pathForFile(file)}
            displayName={file.filename}
            onRemoveAttachment={() => Actions.removeAttachment(headerMessageId, file)}
          />
        ))}
    </div>
  );
};
