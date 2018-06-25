import React, { Component } from 'react';
import { TokenAndTermRegexp } from './search-bar-util';

export default class TokenizingContenteditable extends Component {
  shouldComponentUpdate(nextProps) {
    if (nextProps.value !== this._textEl.innerText) {
      this._textEl.innerText = nextProps.value;
      this._tokensEl.innerHTML = this.valueToHTML(nextProps.value);
      if (document.activeElement === this._textEl) {
        this.focus();
      }
    }
    return false;
  }

  focus = () => {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this._textEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    this._textEl.focus();
  };

  blur = () => {
    this._textEl.blur();
  };

  insertionIndex = () => {
    const range = document.getSelection().getRangeAt(0);
    if (!range || !this._textEl.contains(range.startContainer)) {
      return -1;
    }
    return range.startOffset;
  };

  valueToHTML = text => {
    const tokens = [];
    let m = null;
    let lastIndex = 0;

    text = text.replace(/\s/g, ' ');

    const basicSpan = document.createElement('span');
    const tokenSpan = document.createElement('span');
    tokenSpan.classList.add('token');

    const regexp = TokenAndTermRegexp();
    while ((m = regexp.exec(text))) {
      const before = text.substr(lastIndex, m.index - lastIndex);
      if (before.length) {
        basicSpan.innerText = before;
        tokens.push(basicSpan.outerHTML);
      }
      lastIndex = m.index + m[1].length;
      tokenSpan.innerText = m[1];
      tokens.push(tokenSpan.outerHTML);
    }
    const after = text.substr(lastIndex, text.length - lastIndex);
    if (after.length) {
      basicSpan.innerText = after;
      tokens.push(basicSpan.outerHTML);
    }
    return tokens.join('');
  };

  onChange = e => {
    const value = e.target.innerText;
    this._tokensEl.innerHTML = this.valueToHTML(value);
    this.props.onChange(value);
  };

  render() {
    return (
      <div className="tokenizing-contenteditable">
        <div
          contentEditable
          spellCheck={false}
          className="layer layer-text"
          ref={el => (this._textEl = el)}
          dangerouslySetInnerHTML={{ __html: this.props.value }}
          onKeyDown={this.props.onKeyDown}
          onFocus={this.props.onFocus}
          onBlur={this.props.onBlur}
          onInput={this.onChange}
        />
        <div
          className="layer layer-tokens"
          dangerouslySetInnerHTML={{ __html: this.valueToHTML(this.props.value) }}
          ref={el => (this._tokensEl = el)}
        />
      </div>
    );
  }
}
