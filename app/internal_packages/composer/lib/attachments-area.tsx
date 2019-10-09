import React from 'react';
import { Actions, AttachmentStore, Message } from 'mailspring-exports';
import { AttachmentItem } from 'mailspring-component-kit';

export const AttachmentsArea: React.FunctionComponent<{ draft: Message }> = props => {
  const { files, headerMessageId } = props.draft;

  return (
    <div className="attachments-area">
      {files
        .filter(f => !f.contentId)
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
    </div>
  );
};
