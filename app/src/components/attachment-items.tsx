import fs from 'fs';
import path from 'path';
import classnames from 'classnames';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import * as Actions from '../flux/actions';
import { pickHTMLProps } from 'pick-react-known-prop';
import { RetinaImg } from './retina-img';
import { Flexbox } from './flexbox';
import { Spinner } from './spinner';
import { localized } from '../intl';

const propTypes = {
  className: PropTypes.string,
  draggable: PropTypes.bool,
  focusable: PropTypes.bool,
  filePath: PropTypes.string,
  contentType: PropTypes.string,
  download: PropTypes.shape({
    state: PropTypes.string,
    percent: PropTypes.number,
  }),
  displayName: PropTypes.string,
  displaySize: PropTypes.string,
  fileIconName: PropTypes.string,
  filePreviewPath: PropTypes.string,
  onOpenAttachment: PropTypes.func,
  onRemoveAttachment: PropTypes.func,
  onSaveAttachment: PropTypes.func,
};

const defaultProps = {
  draggable: true,
};

const SPACE = ' ';

function buildContextMenu(fns: {
  onOpenAttachment?: () => void;
  onPreviewAttachment?: () => void;
  onRemoveAttachment?: () => void;
  onSaveAttachment?: () => void;
}) {
  const { remote } = require('electron');
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (fns.onOpenAttachment) {
    template.push({
      click: () => fns.onOpenAttachment(),
      label: localized('Open'),
    });
  }
  if (fns.onRemoveAttachment) {
    template.push({
      click: () => fns.onRemoveAttachment(),
      label: localized('Remove'),
    });
  }
  if (fns.onPreviewAttachment) {
    template.push({
      click: () => fns.onPreviewAttachment(),
      label: localized('Preview'),
    });
  }
  if (fns.onSaveAttachment) {
    template.push({
      click: () => fns.onSaveAttachment(),
      label: localized('Save Into...'),
    });
  }
  remote.Menu.buildFromTemplate(template).popup({});
}

const ProgressBar: React.FunctionComponent<{
  download: {
    state: string;
    percent: number;
  };
}> = ({ download }) => {
  const isDownloading = download ? download.state === 'downloading' : false;
  if (!isDownloading) {
    return <span />;
  }
  const { state: downloadState, percent: downloadPercent } = download;
  const downloadProgressStyle = {
    width: `${Math.min(downloadPercent, 97.5)}%`,
  };
  return (
    <span className={`progress-bar-wrap state-${downloadState}`}>
      <span className="progress-background" />
      <span className="progress-foreground" style={downloadProgressStyle} />
    </span>
  );
};

function AttachmentActionIcon(props) {
  const {
    download,
    removeIcon,
    downloadIcon,
    retinaImgMode,
    onRemoveAttachment,
    onSaveAttachment,
  } = props;

  const isRemovable = onRemoveAttachment != null;
  const isDownloading = download ? download.state === 'downloading' : false;
  const actionIconName = isRemovable || isDownloading ? removeIcon : downloadIcon;

  const onClickActionIcon = event => {
    event.stopPropagation(); // Prevent 'onOpenAttachment'
    if (isRemovable) {
      onRemoveAttachment();
    } else if (onSaveAttachment != null) {
      onSaveAttachment();
    }
  };

  return (
    <div className="file-action-icon" onClick={onClickActionIcon}>
      <RetinaImg name={actionIconName} mode={retinaImgMode} />
    </div>
  );
}
AttachmentActionIcon.propTypes = {
  removeIcon: PropTypes.string,
  downloadIcon: PropTypes.string,
  retinaImgMode: PropTypes.string,
  ...propTypes,
};

interface AttachmentItemProps {
  className: string;
  draggable?: boolean;
  focusable?: boolean;
  filePath: string;
  contentType?: string;
  download?: {
    state: string;
    percent: number;
  };
  displayName?: string;
  displaySize?: string;
  fileIconName?: string;
  filePreviewPath?: string;
  onOpenAttachment?: () => void;
  onSaveAttachment?: () => void;
  onRemoveAttachment: () => void;
}

export class AttachmentItem extends Component<AttachmentItemProps> {
  static displayName = 'AttachmentItem';

  static containerRequired = false;

  static propTypes = propTypes;

  static defaultProps = defaultProps;

  _fileIconComponent: RetinaImg;

  _onDragStart = event => {
    const { contentType, filePath } = this.props;
    if (fs.existsSync(filePath)) {
      // Note: From trial and error, it appears that the second param /MUST/ be the
      // same as the last component of the filePath URL, or the download fails.
      const downloadURL = `${contentType}:${path.basename(filePath)}:file://${filePath}`;
      event.dataTransfer.setData('DownloadURL', downloadURL);
      event.dataTransfer.setData('text/mailspring-file-url', downloadURL);
      const el = ReactDOM.findDOMNode(this._fileIconComponent) as HTMLElement;
      const rect = el.getBoundingClientRect();
      const x = window.devicePixelRatio === 2 ? rect.height / 2 : rect.height;
      const y = window.devicePixelRatio === 2 ? rect.width / 2 : rect.width;
      event.dataTransfer.setDragImage(el, x, y);
    } else {
      event.preventDefault();
    }
  };

  _onAttachmentKeyDown = event => {
    if (event.key === SPACE && this.props.filePreviewPath) {
      event.preventDefault();
      event.stopPropagation();
      Actions.quickPreviewFile(this.props.filePath);
    }
    if (event.key === 'Escape') {
      const attachmentNode = ReactDOM.findDOMNode(this) as HTMLElement;
      if (attachmentNode) {
        attachmentNode.blur();
      }
    }
  };

  _onClickQuicklookIcon = (event?: React.MouseEvent<any>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    Actions.quickPreviewFile(this.props.filePath);
  };

  render() {
    const {
      download,
      className,
      focusable,
      draggable,
      displayName,
      displaySize,
      fileIconName,
      filePreviewPath,
      onOpenAttachment,
      onSaveAttachment,
      ...extraProps
    } = this.props;
    const classes = classnames({
      'nylas-attachment-item': true,
      'file-attachment-item': true,
      'has-preview': filePreviewPath,
      [className]: className,
    });
    const style = draggable ? { WebkitUserDrag: 'element' } : null;
    const tabIndex = focusable ? 0 : null;

    return (
      <div
        style={style}
        className={classes}
        tabIndex={tabIndex}
        onKeyDown={focusable ? this._onAttachmentKeyDown : null}
        draggable={draggable}
        onDoubleClick={onOpenAttachment}
        onDragStart={this._onDragStart}
        onContextMenu={() =>
          buildContextMenu({
            onPreviewAttachment: this._onClickQuicklookIcon,
            onOpenAttachment,
            onSaveAttachment,
          })
        }
        {...pickHTMLProps(extraProps)}
      >
        {filePreviewPath ? (
          <div
            draggable={false}
            className="file-thumbnail-preview"
            style={{
              background: `url('file://${filePreviewPath.replace(/\\/g, '\\\\')}') 0% 1% / cover`,
            }}
          />
        ) : null}
        <div className="inner">
          <ProgressBar download={download} />
          <Flexbox direction="row" style={{ alignItems: 'center' }}>
            <div className="file-info-wrap">
              <RetinaImg
                ref={cm => {
                  this._fileIconComponent = cm;
                }}
                className="file-icon"
                fallback="file-fallback.png"
                mode={RetinaImg.Mode.ContentPreserve}
                name={fileIconName}
              />
              <span className="file-name" title={displayName}>
                {displayName}
              </span>
              <span className="file-size">{displaySize ? `(${displaySize})` : ''}</span>
            </div>
            {filePreviewPath && (
              <div className="file-action-icon quicklook" onClick={this._onClickQuicklookIcon}>
                <RetinaImg name="attachment-quicklook.png" mode={RetinaImg.Mode.ContentIsMask} />
              </div>
            )}
            <AttachmentActionIcon
              {...this.props}
              removeIcon="remove-attachment.png"
              downloadIcon="icon-attachment-download.png"
              retinaImgMode={RetinaImg.Mode.ContentIsMask}
            />
          </Flexbox>
        </div>
      </div>
    );
  }
}

export class ImageAttachmentItem extends Component<AttachmentItemProps & { imgProps?: any }> {
  static displayName = 'ImageAttachmentItem';

  static propTypes = {
    imgProps: PropTypes.object,
    ...propTypes,
  };

  static defaultProps = defaultProps;

  static containerRequired = false;

  _onImgLoaded = () => {
    // on load, modify our DOM just /slightly/. This causes DOM mutation listeners
    // watching the DOM to trigger. This is a good thing, because the image may
    // change dimensions. (We use this to reflow the draft body when this component
    // is within an OverlaidComponent)
    const el = ReactDOM.findDOMNode(this) as HTMLElement;
    if (el) {
      el.classList.add('loaded');
    }
  };

  renderImage() {
    const { download, filePath, draggable } = this.props;
    if (download && download.percent <= 5) {
      return (
        <div style={{ width: '100%', height: '100px' }}>
          <Spinner visible />
        </div>
      );
    }
    const src =
      download && download.percent < 100 ? `${filePath}?percent=${download.percent}` : filePath;
    return <img draggable={draggable} src={src} alt="" onLoad={this._onImgLoaded} />;
  }

  componentDidMount() {
    // NOTE: This is a hack to make copy paste work in the composer when the image void node
    // is the only selection. Waiting for https://github.com/ianstormtaylor/slate/issues/2124 fix.
    const el = ReactDOM.findDOMNode(this);
    const parentVoidNode = el instanceof HTMLElement && el.closest('[data-slate-void]');
    if (parentVoidNode) {
      parentVoidNode.removeAttribute('contenteditable');
    }
  }

  render() {
    const {
      className,
      displayName,
      download,
      onOpenAttachment,
      onSaveAttachment,
      ...extraProps
    } = this.props;
    return (
      <div
        className={`nylas-attachment-item image-attachment-item ${className || ''}`}
        {...pickHTMLProps(extraProps)}
      >
        <div>
          <ProgressBar download={download} />
          <AttachmentActionIcon
            {...this.props}
            removeIcon="image-cancel-button.png"
            downloadIcon="image-download-button.png"
            retinaImgMode={RetinaImg.Mode.ContentPreserve}
          />
          <div
            className="file-preview"
            onDoubleClick={onOpenAttachment}
            onContextMenu={() => buildContextMenu({ onOpenAttachment, onSaveAttachment })}
          >
            <div className="file-name-container">
              <div className="file-name" title={displayName}>
                {displayName}
              </div>
            </div>
            {this.renderImage()}
          </div>
        </div>
      </div>
    );
  }
}
