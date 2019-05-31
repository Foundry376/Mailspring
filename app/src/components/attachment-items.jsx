import fs from 'fs';
import path from 'path';
import classnames from 'classnames';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { pickHTMLProps } from 'pick-react-known-prop';
import RetinaImg from './retina-img';
import Flexbox from './flexbox';
import Spinner from './spinner';
import { AttachmentStore, MessageStore } from 'mailspring-exports';

const propTypes = {
  className: PropTypes.string,
  draggable: PropTypes.bool,
  focusable: PropTypes.bool,
  previewable: PropTypes.bool,
  disabled: PropTypes.bool,
  missing: PropTypes.bool,
  fileId: PropTypes.string,
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
  onDownloadAttachment: PropTypes.func,
  onAbortDownload: PropTypes.func,
};

const defaultProps = {
  draggable: true,
  disabled: false,
  missing: false,
};

const SPACE = ' ';

function ProgressBar(props) {
  const { isDownloading } = props;
  if (!isDownloading) {
    return <span/>;
  }
  // const { state: downloadState, percent: downloadPercent } = download;
  // const downloadProgressStyle = {
  //   width: `${Math.min(downloadPercent, 97.5)}%`,
  // };
  return (
    <span className={`progress-bar-wrap state-downloading`}>
      <span className="progress-background"/>
      <span className="progress-foreground "/>
    </span>
  );
}

ProgressBar.propTypes = propTypes;

function AttachmentActionIcon(props) {
  const {
    missing,
    isDownloading,
    removeIcon,
    downloadIcon,
    retinaImgMode,
    onAbortDownload,
    onRemoveAttachment,
    onDownloadAttachment,
    disabled,
  } = props;

  const isRemovable = (onRemoveAttachment != null) && !disabled;
  const actionIconName = isRemovable || isDownloading ? removeIcon : downloadIcon;

  const onClickActionIcon = event => {
    if (missing) {
      return;
    }
    event.stopPropagation(); // Prevent 'onOpenAttachment'
    if (isRemovable) {
      onRemoveAttachment();
    } else if (isDownloading && onAbortDownload != null) {
      onAbortDownload();
    } else if (!isDownloading && onDownloadAttachment != null) {
      onDownloadAttachment();
    }
  };

  return (
    <div className="file-action-icon" onClick={onClickActionIcon}>
      {isDownloading ?
        <RetinaImg name='refresh.svg'
                   className='infinite-rotation-linear'
                   style={{ width: 24, height: 24 }} isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/> :
        <RetinaImg name={actionIconName} mode={retinaImgMode}/>
      }
    </div>
  );
}

AttachmentActionIcon.propTypes = {
  removeIcon: PropTypes.string,
  downloadIcon: PropTypes.string,
  retinaImgMode: PropTypes.string,
  ...propTypes,
};

export class AttachmentItem extends Component {
  static displayName = 'AttachmentItem';

  static containerRequired = false;

  static propTypes = propTypes;

  static defaultProps = defaultProps;

  constructor(props) {
    super(props);
    this.state = {
      isDownloading: false,
      download: { state: 'done', percent: 100 },
    };
  }

  componentWillReceiveProps(nextProps, nextContext) {
    if (this.props.missing && !nextProps.missing) {
      this.setState({ isDownloading: false, download: { state: 'done', percent: 100 } });
    }
  }

  _canPreview() {
    const { filePath, previewable } = this.props;
    return previewable && process.platform === 'darwin' && fs.existsSync(filePath);
  }

  _previewAttachment() {
    const { filePath } = this.props;
    const currentWin = AppEnv.getCurrentWindow();
    currentWin.previewFile(filePath);
  }

  _onDragStart = event => {
    const { contentType, filePath } = this.props;
    if (fs.existsSync(filePath)) {
      // Note: From trial and error, it appears that the second param /MUST/ be the
      // same as the last component of the filePath URL, or the download fails.
      const downloadURL = `${contentType}:${path.basename(filePath)}:file://${filePath}`;
      event.dataTransfer.setData('DownloadURL', downloadURL);
      event.dataTransfer.setData('text/nylas-file-url', downloadURL);
      const el = ReactDOM.findDOMNode(this._fileIconComponent);
      const rect = el.getBoundingClientRect();
      const x = window.devicePixelRatio === 2 ? rect.height / 2 : rect.height;
      const y = window.devicePixelRatio === 2 ? rect.width / 2 : rect.width;
      event.dataTransfer.setDragImage(el, x, y);
    } else {
      event.preventDefault();
    }
  };
  _onClick = () => {
    if (this.state.isDownloading || this.props.isDownloading) {
      return;
    }
    if (this.props.missing && !this.state.isDownloading) {
      this.setState({ isDownloading: true, download: { state: 'downloading', percent: 100 } });
      MessageStore.fetchMissingAttachmentsByFileIds({ fileIds: [this.props.fileId] });
    }
  };

  _onOpenAttachment = () => {
    if (this.state.isDownloading || this.props.isDownloading) {
      return;
    }
    if (this.props.missing && !this.state.isDownloading) {
      this.setState({ isDownloading: true, download: { state: 'downloading', percent: 100 } });
      MessageStore.fetchMissingAttachmentsByFileIds({ filedIds: [this.props.fileId] });
    }
    const { onOpenAttachment } = this.props;
    if (onOpenAttachment != null) {
      onOpenAttachment();
    }
  };

  _onAttachmentKeyDown = event => {
    if (event.key === SPACE) {
      if (!this._canPreview()) {
        return;
      }
      event.preventDefault();
      this._previewAttachment();
    }
    if (event.key === 'Escape') {
      const attachmentNode = ReactDOM.findDOMNode(this);
      if (attachmentNode) {
        attachmentNode.blur();
      }
    }
  };

  _onClickQuicklookIcon = event => {
    event.preventDefault();
    event.stopPropagation();
    this._previewAttachment();
  };

  render() {
    let {
      download,
      className,
      focusable,
      draggable,
      displayName,
      displaySize,
      fileIconName,
      filePreviewPath,
      disabled,
      isImage,
      filePath,
      ...extraProps
    } = this.props;
    const classes = classnames({
      'nylas-attachment-item': true,
      'file-attachment-item': true,
      'has-preview': filePreviewPath,
      [className]: className,
    });
    if (isImage) {
      filePreviewPath = filePath;
    }
    const style = draggable ? { WebkitUserDrag: 'element' } : null;
    const tabIndex = focusable ? 0 : null;
    const { devicePixelRatio } = window;

    let iconName = AttachmentStore.getExtIconName(displayName);
    return (
      <div
        style={style}
        className={classes}
        tabIndex={tabIndex}
        onKeyDown={focusable && !disabled ? this._onAttachmentKeyDown : null}
        draggable={draggable && !disabled}
        onDoubleClick={!disabled ? this._onOpenAttachment : null}
        onClick={!disabled ? this._onClick : null}
        onDragStart={!disabled ? this._onDragStart : null}
        {...pickHTMLProps(extraProps)}
      >
        <div className="inner">
          <ProgressBar isDownloading={this.state.isDownloading || this.props.isDownloading}/>
          <Flexbox direction="row" style={{ alignItems: 'center' }}>
            <div className="file-info-wrap">
              <div className="attachment-icon">
                {filePreviewPath ? (
                  <div className="file-thumbnail-preview" draggable={false}>
                    <img alt="" src={`file://${filePreviewPath}`} style={{ zoom: 1 / devicePixelRatio }}/>
                  </div>
                ) : (
                  <RetinaImg
                    ref={cm => {
                      this._fileIconComponent = cm;
                    }}
                    className="file-icon"
                    fallback="drafts.svg"
                    name={iconName}
                    isIcon
                    mode={RetinaImg.Mode.ContentIsMask}/>
                )}
              </div>
              <div className="attachment-info">
                <div className="attachment-name" title={displayName}>
                  {displayName}
                </div>
                <div className="file-size">{displaySize ? `${displaySize}` : ''}</div>
                <div className="attachment-action-bar">
                  {this._canPreview() ? (
                    <div className="file-action-icon">
                      <RetinaImg
                        className="quicklook-icon"
                        name="attachment-quicklook.png"
                        mode={RetinaImg.Mode.ContentIsMask}
                        onClick={!disabled ? this._onClickQuicklookIcon : null}
                      />
                    </div>
                  ) : null}
                  <AttachmentActionIcon
                    {...this.props}
                    isDownloading={this.state.isDownloading || this.props.isDownloading}
                    removeIcon="remove-attachment.png"
                    downloadIcon="icon-attachment-download.png"
                    retinaImgMode={RetinaImg.Mode.ContentIsMask}
                  />
                </div>
              </div>
            </div>
          </Flexbox>
        </div>
      </div>
    );
  }
}

export class ImageAttachmentItem extends Component {
  static displayName = 'ImageAttachmentItem';

  static propTypes = {
    imgProps: PropTypes.object,
    ...propTypes,
  };

  static defaultProps = defaultProps;

  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = {
      isDownloading: false,
    };
  }
  componentWillReceiveProps(nextProps, nextContext) {
    if (this.props.missing && !nextProps.missing) {
      this.setState({ isDownloading: false});
    }
  }

  _onOpenAttachment = () => {
    if (this.state.isDownloading || this.props.isDownloading) {
      return;
    }
    if (this.props.missing && !this.state.isDownloading) {
      this.setState({ isDownloading: true, download: { state: 'downloading', percent: 100 } });
      MessageStore.fetchMissingAttachmentsByFileIds({ filedIds: [this.props.fileId] });
    }
    const { onOpenAttachment } = this.props;
    if (onOpenAttachment != null) {
      onOpenAttachment();
    }
  };

  _onImgLoaded = () => {
    // on load, modify our DOM just /slightly/. This causes DOM mutation listeners
    // watching the DOM to trigger. This is a good thing, because the image may
    // change dimensions. (We use this to reflow the draft body when this component
    // is within an OverlaidComponent)
    const el = ReactDOM.findDOMNode(this);
    if (el) {
      el.classList.add('loaded');
    }
  };

  renderImage() {
    const { isDownloading, filePath, draggable } = this.props;
    if (isDownloading || this.state.isDownloading) {
      return (
        <div style={{ width: '100%', height: '100px' }}>
          <Spinner visible />
        </div>
      );
    }
    // const src =filePath;
    return <img draggable={draggable} src={filePath} alt="" onLoad={this._onImgLoaded} />;
  }

  render() {
    const { className, displayName, download, disabled, ...extraProps } = this.props;
    const classes = `nylas-attachment-item image-attachment-item ${className || ''}`;
    return (
      <div className={classes} {...pickHTMLProps(extraProps)}>
        <div>
          <ProgressBar isDownloading={this.state.isDownloading || this.props.isDownloading}/>
          <AttachmentActionIcon
            {...this.props}
            removeIcon="image-cancel-button.png"
            downloadIcon="image-download-button.png"
            isDownloading={this.state.isDownloading || this.props.isDownloading}
            retinaImgMode={RetinaImg.Mode.ContentPreserve}
            onAbortDownload={null}
          />
          <div className="file-preview" onDoubleClick={!disabled ? this._onOpenAttachment : null}>
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
