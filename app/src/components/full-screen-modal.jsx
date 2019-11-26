import ReactDOM from 'react-dom';
import React, { Component } from 'react';
import { PropTypes } from 'mailspring-exports';
import RetinaImg from './retina-img';

export default class FullScreenModal extends React.Component {
  static propTypes = {
    className: PropTypes.string,
    visible: PropTypes.bool,
    closable: PropTypes.bool,
    getContainer: PropTypes.func,
    mask: PropTypes.bool,
    maskClosable: PropTypes.bool,
    zIndex: PropTypes.number,
    onCancel: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.insertNode = document.body;
    if (props.getContainer && typeof props.getContainer === 'function') {
      const insertNodeFromProps = props.getContainer();
      if (insertNodeFromProps instanceof HTMLElement) {
        this.insertNode = insertNodeFromProps;
      }
    }
  }

  componentDidMount() {
    this.renderToContainer(this.props.visible);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.visible !== nextProps.visible) {
      this.renderToContainer(nextProps.visible);
    }
  }

  _onClickWrap = () => {
    const { mask, maskClosable, onCancel } = this.props;
    if (!mask || !maskClosable || !onCancel || typeof onCancel !== 'function') {
      return;
    }
    onCancel();
  };

  _onClickClose = () => {
    const { onCancel } = this.props;
    if (onCancel && typeof onCancel === 'function') {
      onCancel();
    }
  };

  retContainer() {
    const { zIndex } = this.props;
    if (!this.popupNode) {
      const popupNode = document.createElement('div');
      popupNode.setAttribute('class', 'component_modal');
      popupNode.setAttribute('style', `z-index: ${typeof zIndex === 'number' ? zIndex : 100}`);
      this.popupNode = popupNode;
      this.insertNode.appendChild(popupNode);
    }
    return this.popupNode;
  }

  retContent() {
    const { className, children, mask, closable } = this.props;
    return (
      <div className={mask ? 'component_modal_wrap' : ''} onClick={this._onClickWrap}>
        <div
          className={`modal_content${className ? ' ' + className : ''}`}
          onClick={e => {
            e.stopPropagation();
          }}
        >
          {closable ? (
            <RetinaImg
              isIcon
              className="modal-close"
              style={{ width: '24', height: '24' }}
              name="close.svg"
              mode={RetinaImg.Mode.ContentIsMask}
              onClick={this._onClickClose}
            />
          ) : null}
          {children}
        </div>
      </div>
    );
  }

  renderToContainer(visible) {
    if (!visible) {
      if (this.popupNode) {
        this.insertNode.removeChild(this.popupNode);
        this.popupNode = null;
      }
    } else {
      ReactDOM.unstable_renderSubtreeIntoContainer(this, this.retContent(), this.retContainer());
    }
  }

  render() {
    return null;
  }
}
