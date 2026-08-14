import React from 'react';
import { localized, Actions, AttachmentStore, Message } from 'mailspring-exports';
import { AttachmentItem, RetinaImg } from 'mailspring-component-kit';

export const AttachmentsArea: React.FunctionComponent<{
  draft: Message;
  // Number of dragged-in threads whose .eml files are still being fetched from
  // the sync engine. They aren't files on the draft yet, so they're rendered
  // here as placeholders to show the drop was accepted.
  attachingThreadCount?: number;
}> = (props) => {
  const { files, headerMessageId } = props.draft;
  const attachingThreadCount = props.attachingThreadCount || 0;

  return (
    <div className="attachments-area">
      {files
        .filter((f) => !f.contentId)
        .map((file) => (
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
      {attachingThreadCount > 0 && (
        <div className="attaching-messages">
          <RetinaImg name="inline-loading-spinner.gif" mode={RetinaImg.Mode.ContentPreserve} />
          <span>
            {attachingThreadCount === 1
              ? localized('Attaching message…')
              : localized('Attaching %1$@ messages…', attachingThreadCount)}
          </span>
        </div>
      )}
    </div>
  );
};
