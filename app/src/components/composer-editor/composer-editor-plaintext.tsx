import React from 'react';
import { wrapPlaintextWithSelection } from './plaintext';
import { handleFilePasted } from './composer-editor';

interface ComposerEditorPlaintextProps {
  value: string;
  propsForPlugins: any;
  onChange: (value: string) => void;
  className?: string;
  onBlur?: (e: React.FocusEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onFileReceived?: (path: string) => void;
}

export class ComposerEditorPlaintext extends React.Component<ComposerEditorPlaintextProps> {
  _el: React.RefObject<HTMLTextAreaElement> = React.createRef<HTMLTextAreaElement>();
  _wrapEl: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this.updateHeight();
  }

  updateHeight = () => {
    const el = this._el.current;
    const wrapEl = this._wrapEl.current;
    if (!el || !wrapEl) return;
    wrapEl.style.height = el.style.height;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
    wrapEl.style.height = el.style.height;
  };

  // Public methods required for compatibility with the rich text ComposerEditor.

  focus = () => {
    this.focusEndReplyText();
  };

  focusEndReplyText = () => {
    if (!this._el.current) return;
    this._el.current.focus();

    const value = this._el.current.value;
    const quoteStart = /(On [A-Za-z0-9]+|\n> |-------)/g.exec(value);
    let pos = value.length;
    if (quoteStart) {
      pos = quoteStart.index;
      while (value[pos - 1] === '\n') {
        pos -= 1;
      }
    }
    this._el.current.setSelectionRange(pos, pos, 'forward');
  };

  focusEndAbsolute = () => {
    if (!this._el.current) return;
    this._el.current.focus();
    const pos = this._el.current.value.length;
    this._el.current.setSelectionRange(pos, pos, 'forward');
  };

  removeQuotedText = () => {};

  insertInlineAttachment = file => {};

  onFocusIfBlurred = event => {
    this._el.current.focus();
  };

  // When we receive focus, the default browser behavior is to move the insertion point
  // to the end of text. If you tabbed in from the Subject field and there's quoted or
  // forwarded text this is not great. For now, let's aggressively shift selection to
  // the end of the user content.
  onFocus = event => {
    if (!this._el.current) return;
    if (this._el.current.value.length === this._el.current.selectionStart) {
      this.focusEndReplyText();
    }
  };

  // When you backspace at the beginning of a line of quoted text that has content
  // after the insertion point, our fancy wrapPlaintext method won't let you delete
  // the `> ` because it'll keep re-wrapping the content following the insertion
  // point onto a new line and helpfully inserting the `> `. To fix this, this hack
  // deletes the entire `> ` in this scenario (as opposed to just the one ` ` char).
  onKeyUp = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' && event.target instanceof HTMLTextAreaElement) {
      const { value, selectionStart, selectionEnd, selectionDirection } = event.target;
      const preceding = value.substr(0, selectionStart);
      const precedingQuotePrefix = />+ $/.exec(preceding);

      if (precedingQuotePrefix && selectionStart === selectionEnd) {
        event.target.value =
          value.substr(0, precedingQuotePrefix.index) + value.substr(selectionStart);
        event.target.setSelectionRange(
          precedingQuotePrefix.index,
          precedingQuotePrefix.index,
          selectionDirection as any
        );
        event.preventDefault();
      }
    }
  };

  onPaste = (event: React.ClipboardEvent<any>) => {
    const { onFileReceived } = this.props;
    if (onFileReceived && handleFilePasted(event.nativeEvent, onFileReceived)) {
      event.preventDefault();
    }
  };

  onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const wrapped = wrapPlaintextWithSelection(event.target);
    this.props.onChange(wrapped.value);

    if (value !== wrapped.value) {
      event.target.value = wrapped.value;
      event.target.setSelectionRange(wrapped.selectionStart, wrapped.selectionEnd, event.target
        .selectionDirection as any);
    }
    this.updateHeight();
  };

  // Event Handlers
  render() {
    const { className, onDrop } = this.props;

    return (
      <div
        ref={this._wrapEl}
        className={`composer-editor-plaintext ${className || ''}`}
        onDrop={onDrop}
      >
        <textarea
          value={this.props.value}
          cols={72}
          wrap="hard"
          onFocus={this.onFocus}
          onChange={this.onChange}
          onPaste={this.onPaste}
          onKeyUp={this.onKeyUp}
          ref={this._el}
        />
      </div>
    );
  }
}
