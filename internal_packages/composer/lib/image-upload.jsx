import React from 'react';
import ReactDOM from 'react-dom';
import FileUpload from './file-upload';
import {RetinaImg} from 'nylas-component-kit';

export default class ImageUpload extends FileUpload {
  static displayName = 'ImageUpload';

  static propTypes = {
    uploadData: React.PropTypes.object,
  };

  _onDragStart = (event) => {
    event.preventDefault();
  }

  _onLoaded = () => {
    // on load, modify our DOM just /slightly/. This gives DOM mutation listeners
    // that might be watching us (for ex: when we're in an overlaid component)
    // a chance to recompute the image size.
    const el = ReactDOM.findDOMNode(this);
    if (el) {
      el.classList.add('loaded');
    }
  }

  render() {
    return (
      <div className="file-wrap file-image-wrap file-upload">
        <div className="file-action-icon" onClick={this._onClickRemove}>
          <RetinaImg name="image-cancel-button.png" mode={RetinaImg.Mode.ContentPreserve} />
        </div>

        <div className="file-preview">
          <div className="file-name-container">
            <div className="file-name">{this.props.upload.filename}</div>
          </div>

          <img
            className="upload"
            src={this.props.upload.targetPath}
            alt="drag start"
            onLoad={this._onLoaded}
            onDragStart={this._onDragStart}
          />
        </div>
      </div>
    );
  }
}
