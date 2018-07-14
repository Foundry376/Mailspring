import React, { Component } from 'react';
import { TokenAndTermRegexp } from './search-bar-util';

export default class TokenizingContenteditable extends Component {
  shouldComponentUpdate(nextProps) {
    if (nextProps.value !== this._textEl.innerText.replace(/\s/g, ' ')) {
      this._textEl.innerHTML = nextProps.value.replace(/\s/g, '&nbsp;');
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
    const sel = document.getSelection();
    if (sel.rangeCount === 0) {
      return -1;
    }
    const range = sel.getRangeAt(0);

    if (!range) {
      return -1;
    }

    // The selection is in node units
    if (range.startContainer === this._textEl && range.endContainer === this._textEl) {
      return range.startOffset === 0 ? 0 : this._textEl.textContent.length;
    }

    // The selection is in text units
    if (this._textEl.contains(range.startContainer)) {
      return range.startOffset;
    }

    return -1;
  };

  valueToHTML = text => {
    const tokens = [];
    let m = null;
    let lastIndex = 0;

    text = text.replace(/\s/g, ' '); // with all standard space characters

    const basicSpan = document.createElement('span');
    const tokenSpan = document.createElement('span');
    tokenSpan.classList.add('layer-token');

    const regexp = TokenAndTermRegexp();
    while ((m = regexp.exec(text))) {
      const before = text.substr(lastIndex, m.index - lastIndex);
      if (before.length) {
        basicSpan.innerText = before;
        tokens.push(basicSpan.outerHTML);
      }
      lastIndex = m.index + m[1].length + m[2].length;
      tokenSpan.innerText = m[1] + m[2];
      tokens.push(tokenSpan.outerHTML);
    }
    const after = text.substr(lastIndex, text.length - lastIndex);
    if (after.length) {
      basicSpan.innerText = after;
      tokens.push(basicSpan.outerHTML);
    }
    return tokens.join('');
  };

  onPaste = e => {
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData
      .getData('text/plain')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    document.execCommand('insertText', false, text);

    if (document.activeElement === this._textEl) {
      const sel = window.getSelection();
      const x = sel.getRangeAt(0).getBoundingClientRect().x;
      const parent = this._textEl.parentNode;
      const w = parent.getBoundingClientRect().width;
      if (x > w) {
        parent.scrollLeft += x - w;
      }
    }
  };

  onChange = e => {
    const value = e.target.innerText.replace(/\s/g, ' ');
    this._tokensEl.innerHTML = this.valueToHTML(value);
    this.props.onChange(value);
  };

  onContextMenu = event => {
    const sel = document.getSelection();
    AppEnv.windowEventHandler.openSpellingMenuFor(sel.toString(), !sel.isCollapsed, {
      onCorrect: correction => {
        document.execCommand('insertText', false, correction);
      },
    });
  };

  render() {
    return (
      <div className="tokenizing-contenteditable" onContextMenu={this.onContextMenu}>
        <div
          contentEditable
          spellCheck={false}
          className="layer layer-text"
          ref={el => (this._textEl = el)}
          dangerouslySetInnerHTML={{ __html: this.props.value.replace(/\s/g, '&nbsp;') }}
          onKeyDown={this.props.onKeyDown}
          onPaste={this.onPaste}
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
