import React, { Component } from 'React';
import PropTypes from 'prop-types';

export class RichText extends Component {
  static propTypes = {
    className: PropTypes.string,
    placeholder: PropTypes.string,
    maxRows: PropTypes.number,
  };

  constructor() {
    super();
    this.state = {
      listenKeys: new Set(),
      listenKeysMapping: new Map(),
    };
    this._richText = null;
  }

  componentDidMount() {
    const { keyMapping = [] } = this.props;
    const listenKeys = new Set();
    const listenKeysMapping = new Map();
    keyMapping.forEach(listenEvent => {
      if (listenEvent && typeof listenEvent.keyCode === 'number') {
        listenKeys.add(listenEvent.keyCode);
        const theKeyEventList = listenKeysMapping.get(listenEvent.keyCode) || [];
        theKeyEventList.push(listenEvent);
        listenKeysMapping.set(listenEvent.keyCode, theKeyEventList);
      }
    });
    this.setState({
      listenKeys,
      listenKeysMapping: listenKeysMapping,
    });
  }

  _onKeyDown = event => {
    const { listenKeys, listenKeysMapping } = this.state;
    const { nativeEvent } = event;
    const { keyCode } = nativeEvent;
    if (!listenKeys.has(keyCode)) {
      return true;
    } else {
      const keyEventList = listenKeysMapping.get(keyCode) || [];
      for (const matchingKey of keyEventList) {
        // 指定了功能键就需要相等或未指定功能键
        if (
          (typeof matchingKey.altKey !== 'boolean' || !!matchingKey.altKey === !!event.altKey) &&
          (typeof matchingKey.ctrlKey !== 'boolean' || !!matchingKey.ctrlKey === !!event.ctrlKey) &&
          (typeof matchingKey.shiftKey !== 'boolean' ||
            !!matchingKey.shiftKey === !!event.shiftKey) &&
          (typeof matchingKey.metaKey !== 'boolean' || !!matchingKey.metaKey === !!event.metaKey)
        ) {
          if (matchingKey.preventDefault) {
            event.preventDefault();
          }
          if (matchingKey.stopPropagation) {
            event.stopPropagation();
          }
          if (matchingKey.keyEvent && typeof matchingKey.keyEvent === 'function') {
            matchingKey.keyEvent(event);
          }
          return false;
        }
      }
    }
    return true;
  };

  _onInputChange = () => {
    const { onChange } = this.props;
    if (onChange && typeof onChange === 'function') {
      // emit change event
      onChange(this.getNode());
    }
  };

  _autoFocus = () => {
    this._richText.focus();
  };

  getNode = () => {
    return this._richText.innerHTML;
  };

  addNode = content => {
    if (!content) {
      //如果插入的内容为空则返回
      return;
    }

    let insertNode;
    if (content instanceof HTMLElement) {
      insertNode = content;
      insertNode.setAttribute('contenteditable', false);
    } else if (typeof content === 'string') {
      insertNode = document.createTextNode(content);
    }

    this._autoFocus();

    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      const lastNode = frag.appendChild(insertNode);
      range.insertNode(frag);
      const contentRange = range.cloneRange();
      contentRange.setStartAfter(lastNode);
      sel.removeAllRanges();
      sel.addRange(contentRange);
    }
    this._onInputChange();
  };

  clearNode = () => {
    this._richText.innerHTML = '';
    this._onInputChange();
  };

  delNode = n => {
    this._autoFocus();

    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      let newOffset = range.startOffset - n || 0;
      if (newOffset > range.startContainer.length) {
        newOffset = range.startContainer.length;
      }
      range.setStart(range.startContainer, newOffset);
      range.deleteContents();
      let contentRange = range.cloneRange();
      sel.removeAllRanges();
      sel.addRange(contentRange);
    }
    this._onInputChange();
  };

  getInputText = () => {
    this._autoFocus();

    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      if (range.startContainer.nodeType === 3) {
        const offset = range.startOffset;
        return range.startContainer.nodeValue.slice(0, offset);
      }
    }
    return '';
  };

  render() {
    const { className, placeholder, maxRows = 3, lineHeight = 20, onBlur } = this.props;
    return (
      <div
        className={className ? `rich-text-input ${className}` : 'rich-text-input'}
        style={{
          lineHeight: `${lineHeight}px`,
          maxHeight: `${17 + lineHeight * maxRows}px`,
        }}
        dataplaceholder={placeholder}
        contentEditable="true"
        suppressContentEditableWarning="true"
        onBlur={onBlur}
        onKeyDown={this._onKeyDown}
        onInput={this._onInputChange}
        ref={el => (this._richText = el)}
      />
    );
  }
}
