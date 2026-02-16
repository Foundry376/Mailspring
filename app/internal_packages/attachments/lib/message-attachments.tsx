import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Actions, Utils, AttachmentStore, File } from 'mailspring-exports';
import { AttachmentItem, ImageAttachmentItem } from 'mailspring-component-kit';

interface MessageAttachmentsProps {
  files: File[];
  downloads: { [fileId: string]: null };
  headerMessageId: string;
  filePreviewPaths: {
    [fileId: string]: string;
  };
  canRemoveAttachments: boolean;
  onOpenPDFPreview?: (fileId: string, filePath: string, displayName: string) => void;
}

class MessageAttachments extends Component<MessageAttachmentsProps> {
  static displayName = 'MessageAttachments';

  static containerRequired = false;

  static propTypes = {
    files: PropTypes.array,
    downloads: PropTypes.object,
    headerMessageId: PropTypes.string,
    filePreviewPaths: PropTypes.object,
    canRemoveAttachments: PropTypes.bool,
    onOpenPDFPreview: PropTypes.func,
  };

  static defaultProps = {
    downloads: {},
    filePreviewPaths: {},
  };

  renderAttachment(AttachmentRenderer, file) {
    const { canRemoveAttachments, downloads, filePreviewPaths, onOpenPDFPreview } = this.props;
    const download = downloads[file.id];
    const filePath = AttachmentStore.pathForFile(file);
    const fileIconName = `file-${file.displayExtension()}.png`;
    const displayName = file.displayName();
    const displaySize = file.displayFileSize();
    const contentType = file.contentType;
    const displayFilePreview = AppEnv.config.get('core.attachments.displayFilePreview');
    const filePreviewPath = displayFilePreview ? filePreviewPaths[file.id] : null;

    // Check if this is a PDF file
    const isPDF = file.displayExtension().toLowerCase() === 'pdf';
    console.log('MessageAttachments renderAttachment:', {
      fileName: displayName,
      extension: file.displayExtension(),
      isPDF,
      hasPDFHandler: !!onOpenPDFPreview
    });

    const onOpenAttachment = isPDF && onOpenPDFPreview
      ? () => {
        console.log('PDF attachment clicked, opening preview');
        onOpenPDFPreview(file.id, filePath, displayName);
      }
      : () => Actions.fetchAndOpenFile(file);

    const onClickAttachment = isPDF && onOpenPDFPreview ? onOpenAttachment : undefined;

    return (
      <AttachmentRenderer
        key={file.id}
        focusable
        filePath={filePath}
        download={download}
        contentType={contentType}
        displayName={displayName}
        displaySize={displaySize}
        fileIconName={fileIconName}
        filePreviewPath={filePreviewPath}
        onClick={onClickAttachment}
        onOpenAttachment={onOpenAttachment}
        onSaveAttachment={() => Actions.fetchAndSaveFile(file)}
        onRemoveAttachment={
          canRemoveAttachments
            ? () => Actions.removeAttachment({ headerMessageId: this.props.headerMessageId, file })
            : null
        }
      />
    );
  }

  render() {
    const { files } = this.props;
    const nonImageFiles = files.filter(f => !Utils.shouldDisplayAsImage(f));
    const imageFiles = files.filter(f => Utils.shouldDisplayAsImage(f));
    return (
      <div>
        {nonImageFiles.map(file => this.renderAttachment(AttachmentItem, file))}
        {imageFiles.map(file => this.renderAttachment(ImageAttachmentItem, file))}
      </div>
    );
  }
}

export default MessageAttachments;
