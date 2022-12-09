import fs from 'fs';
import path from 'path';
import classnames from 'classnames';
import React, { Component, CSSProperties } from 'react';
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
  require('@electron/remote')
    .Menu.buildFromTemplate(template)
    .popup({});
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

interface ImageAttachmentItemProps extends AttachmentItemProps {
  onResized: (width: number, height: number) => void;
  imgProps?: { width: number; height: number };
}

export class ImageAttachmentItem extends Component<ImageAttachmentItemProps> {
  static displayName = 'ImageAttachmentItem';

  static propTypes = {
    imgProps: PropTypes.object,
    onResized: PropTypes.func,
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
    const { download, filePath, draggable, imgProps } = this.props;
    if (download && download.percent <= 5) {
      return (
        <div style={{ width: '100%', height: '100px' }}>
          <Spinner visible />
        </div>
      );
    }

    const src =
        download && download.percent < 100 ? `${filePath}?percent=${download.percent}` : filePath,
      styles: CSSProperties = {};

    if (imgProps) {
      if (imgProps.height) {
        styles.height = `${imgProps.height}px`;
      }

      if (imgProps.width) {
        styles.width = `${imgProps.width}px`;
      }
    }

    return <img draggable={draggable} src={src} alt="" onLoad={this._onImgLoaded} style={styles} />;
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
        <div className="resizer" onMouseDown={this._resizeStart}>
          <i className="gg-arrows-expand-left"></i>
        </div>
      </div>
    );
  }

  private _pData = { x: 0, y: 0, eH: 0 };
  private _shiftData = {
    held: false,
    ratio: { wh: 0, hw: 0 },
  };
  private _editor = () => document.querySelector('.compose-body') as HTMLDivElement;

  private _resizeImage = (
    ev: (
      | MouseEvent
      | {
          x: number;
          y: number;
        }
    ) & { useWH?: boolean }
  ) => {
    const img = document.querySelector(
        '.image-attachment-item[data-resizing] .file-preview img'
      ) as HTMLImageElement,
      editor = this._editor();

    if (img) {
      let newWidth = ev.x - img.x,
        newHeight = ev.y - img.y;
      const width = ev.useWH ? newHeight * this._shiftData.ratio.wh : img.width;

      if (!this._shiftData.held) {
        if (
          (newWidth - width) * this._shiftData.ratio.hw >
          (newHeight - img.height) * this._shiftData.ratio.wh
        ) {
          newHeight = newWidth * this._shiftData.ratio.hw;
        } else {
          newWidth = newHeight * this._shiftData.ratio.wh;
        }
      }

      img.style.width = `${newWidth}px`;
      img.style.height = `${newHeight}px`;
    }

    const firstChild = editor.children[0] as HTMLDivElement;
    if (Number.parseInt(editor.style.flexBasis) < firstChild.offsetHeight) {
      editor.style.flexBasis = `${firstChild.offsetHeight}px`;
    }

    this._pData = { x: ev.x, y: ev.y, eH: editor.clientHeight };
  };

  private _resizeImageKeyPress = (ev: KeyboardEvent) => {
    const oldHeld = this._shiftData.held;

    this._shiftData.held = ev.shiftKey;

    if (oldHeld !== ev.shiftKey) {
      this._resizeImage({
        x: this._pData.x,
        y: this._pData.y,
        useWH: true,
      });
    }
  };

  private _resizeStart = (ev: React.MouseEvent<HTMLDivElement>) => {
    ev.preventDefault();

    const parent = ev.currentTarget.parentNode as HTMLDivElement,
      imgEl = parent.querySelector('.file-preview img') as HTMLImageElement,
      editor = this._editor();

    this._pData = { x: ev.pageX, y: ev.pageY, eH: editor.clientHeight };
    this._shiftData.held = ev.shiftKey;
    this._shiftData.ratio = { wh: imgEl.width / imgEl.height, hw: imgEl.height / imgEl.width };

    parent.dataset.resizing = '1';
    imgEl.draggable = false;

    editor.addEventListener('mousemove', this._resizeImage);
    editor.addEventListener('mouseup', this._resizeEnd);
    editor.parentElement.parentElement.parentElement.addEventListener(
      'mouseleave',
      this._resizeEnd
    );
    editor.addEventListener('keydown', this._resizeImageKeyPress);
    editor.addEventListener('keyup', this._resizeImageKeyPress);

    editor.style.flexBasis = `${(editor.children[0] as HTMLDivElement).offsetHeight}px`;
  };

  private _resizeEnd = (ev: MouseEvent) => {
    ev.preventDefault();

    const editor = this._editor(),
      target = editor.querySelector('.image-attachment-item[data-resizing]') as HTMLDivElement;

    if (editor.clientHeight == this._pData.eH && target) {
      delete target.dataset.resizing;

      (target.querySelector('.file-preview img') as HTMLImageElement).draggable = true;
      editor.removeEventListener('mousemove', this._resizeImage);
      editor.removeEventListener('mouseup', this._resizeEnd);
      editor.parentElement.parentElement.parentElement.removeEventListener(
        'mouseleave',
        this._resizeEnd
      );
      editor.removeEventListener('keydown', this._resizeImageKeyPress);
      editor.removeEventListener('keyup', this._resizeImageKeyPress);

      editor.animate([{ flexBasis: `${(editor.children[0] as HTMLDivElement).offsetHeight}px` }], {
        duration: 500,
        iterations: 1,
      }).onfinish = () => {
        editor.style.flexBasis = '';
      };

      const img = target.querySelector('.file-preview img') as HTMLImageElement;
      this.props.onResized(img.width, img.height);
    } else {
      this._pData.eH = editor.clientHeight;
    }
  };
}
