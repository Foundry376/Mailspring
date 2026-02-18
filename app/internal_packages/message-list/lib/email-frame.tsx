import { EventedIFrame } from 'mailspring-component-kit';
import React from 'react';
import ReactDOM from 'react-dom';
import {
  PropTypes,
  Utils,
  QuotedHTMLTransformer,
  MessageStore,
  Message,
  Autolink,
} from 'mailspring-exports';
import { adjustImages } from './adjust-images';
import EmailFrameStylesStore from './email-frame-styles-store';

interface EmailFrameProps {
  content: string;
  showQuotedText: boolean;
  message: Message;
}

export default class EmailFrame extends React.Component<EmailFrameProps> {
  static displayName = 'EmailFrame';

  static propTypes = {
    content: PropTypes.string.isRequired,
    message: PropTypes.object,
    showQuotedText: PropTypes.bool,
  };

  _mounted = false;
  _unlisten: () => void;
  _iframeComponent: EventedIFrame;
  _iframeWrapperEl: HTMLDivElement;
  _iframeDocObserver: ResizeObserver;
  _lastFitSize = '';

  _stripQuotedPlaintext = (content: string) => {
    if (!content) {
      return content;
    }

    const lines = content.split(/\r?\n/);
    const headerLineRegex = /^\s*(?:From|Sent|Date|To|Cc|Subject)\s*:/i;
    const separatorLineRegex = /^\s*(?:-{10,}|_{10,})\s*$/;

    const hasHeaderBlockNear = (start: number) => {
      let hits = 0;
      const end = Math.min(lines.length, start + 12);
      for (let i = start; i < end; i++) {
        if (headerLineRegex.test(lines[i])) {
          hits += 1;
          if (hits >= 2) {
            return true;
          }
        }
      }
      return false;
    };

    for (let i = 0; i < lines.length; i++) {
      if (separatorLineRegex.test(lines[i]) && hasHeaderBlockNear(i + 1)) {
        return lines.slice(0, i).join('\n').replace(/\s+$/, '');
      }
    }

    // Fallback for clients that omit separators and only include header block.
    let headerStart = -1;
    let headerHits = 0;
    for (let i = 0; i < lines.length; i++) {
      if (headerLineRegex.test(lines[i])) {
        if (headerStart === -1) {
          headerStart = i;
        }
        headerHits += 1;
        if (headerHits >= 3) {
          return lines.slice(0, headerStart).join('\n').replace(/\s+$/, '');
        }
      } else if (headerStart !== -1 && lines[i].trim() !== '') {
        headerStart = -1;
        headerHits = 0;
      }
    }

    return content;
  };

  componentDidMount() {
    this._mounted = true;
    this._iframeDocObserver = new window.ResizeObserver(entries =>
      window.requestAnimationFrame(() => {
        if (!this._mounted) return;
        this._onReevaluateContentSize(entries[0]);
      })
    );
    this._writeContent();
    this._unlisten = EmailFrameStylesStore.listen(this._writeContent);
  }

  shouldComponentUpdate(nextProps: EmailFrameProps) {
    const { content, showQuotedText, message } = this.props;
    const nextMessage = nextProps.message;

    return (
      (message ? message.id : '') !== (nextMessage ? nextMessage.id : '') ||
      content !== nextProps.content ||
      showQuotedText !== nextProps.showQuotedText ||
      !Utils.isEqualReact(
        message && message.pluginMetadata,
        nextMessage && nextMessage.pluginMetadata
      )
    );
  }

  componentDidUpdate() {
    this._writeContent();
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._iframeDocObserver) this._iframeDocObserver.disconnect();
    if (this._unlisten) this._unlisten();
  }

  _writeContent = () => {
    if (this._iframeDocObserver) this._iframeDocObserver.disconnect();

    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent) as HTMLIFrameElement;
    const doc = iframeEl.contentDocument;
    if (!doc) return;

    // NOTE: The iframe must have a modern DOCTYPE. The lack of this line
    // will cause some bizzare non-standards compliant rendering with the
    // message bodies. This is particularly felt with <table> elements use
    // the `border-collapse: collapse` css property while setting a
    // `padding`.
    const { message, showQuotedText } = this.props;
    const styles = EmailFrameStylesStore.styles();
    const restrictWidth = AppEnv.config.get('core.reading.restrictMaxWidth');

    let content = this.props.content;
    if (!showQuotedText) {
      console.log('[EmailFrame] Incoming body preview:', JSON.stringify(content.slice(0, 300)));
      console.log('[EmailFrame] message.plaintext:', message.plaintext);
      const plaintextStripped = this._stripQuotedPlaintext(content);
      const clippedByPlaintext = plaintextStripped !== content;
      console.log('[EmailFrame] clippedByPlaintext:', clippedByPlaintext);
      if (plaintextStripped !== content) {
        content = plaintextStripped;
        console.log('[EmailFrame] Using plaintext-stripped content');
      } else if (!message.plaintext) {
        content = QuotedHTMLTransformer.removeQuotedHTML(content, {
          keepIfWholeBodyIsQuote: true,
        });
        console.log('[EmailFrame] Using HTML QuotedHTMLTransformer result');
      }
    }

    doc.open();

    if (message.plaintext) {
      doc.write(
        `<!DOCTYPE html>` +
        (styles ? `<style>${styles}</style>` : '') +
        `<div id='inbox-plain-wrapper' class="${process.platform}"></div>`
      );
      doc.close();
      doc.getElementById('inbox-plain-wrapper').innerText = content;
    } else {
      doc.write(
        `<!DOCTYPE html>` +
        (styles ? `<style>${styles}</style>` : '') +
        `<div id='inbox-html-wrapper' class="${process.platform}">${content}</div>`
      );
      doc.close();
    }

    if (doc.body && restrictWidth) {
      doc.body.classList.add('restrict-width');
    }

    // Notify the EventedIFrame that we've replaced it's document (with `open`)
    // so it can attach event listeners again.
    this._lastFitSize = '';
    this._iframeComponent.didReplaceDocument();

    // Observe the <html> element within the iFrame for changes to it's content
    // size. We need to disconnect the observer before the HTML element is deleted
    // or Chrome gets into a "maximum call depth" Observer error.
    const observedEl = iframeEl.contentDocument.firstElementChild;
    this._iframeDocObserver.observe(observedEl);
    iframeEl.contentWindow.addEventListener('beforeunload', () => {
      this._iframeDocObserver.disconnect();
    });

    window.requestAnimationFrame(() => {
      Autolink(doc.body, {
        async: true,
        telAggressiveMatch: false,
      });
      adjustImages(doc);

      for (const extension of MessageStore.extensions()) {
        if (!extension.renderedMessageBodyIntoDocument) {
          continue;
        }
        try {
          extension.renderedMessageBodyIntoDocument({
            document: doc,
            message: message,
            iframe: iframeEl,
          });
        } catch (e) {
          AppEnv.reportError(e);
        }
      }
    });
  };

  _onReevaluateContentSize = (entry: ResizeObserverEntry) => {
    const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
    if (size === this._lastFitSize || !this._iframeComponent) return;

    this._lastFitSize = size;
    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent) as HTMLIFrameElement;
    const doc = iframeEl && iframeEl.contentDocument;

    // We must set the height to zero in order to get a valid scrollHeight
    // if the document is wider and has a lower height now.
    this._iframeComponent.setHeightQuietly(0);

    // If documentElement has a scroll height, prioritize that as height
    // If not, fall back to body scroll height by setting it to auto
    let height = 0;
    let width = 0;
    if (doc && doc.documentElement && doc.documentElement.scrollHeight > 0) {
      width = doc.documentElement.scrollWidth;
      height = doc.documentElement.scrollHeight;
    } else if (doc && doc.body) {
      const style = window.getComputedStyle(doc.body);
      if (style.height === '0px') {
        doc.body.style.height = 'auto';
      }
      width = doc.body.scrollWidth;
      height = doc.body.scrollHeight;
    }

    if (width > iframeEl.clientWidth) {
      // the message will scroll horizontally, and we need to add 20px to the height of
      // the iframe to allow for it's scrollbar. Otherwise it covers the last line of text.
      height += 20;
    }

    this._iframeComponent.setHeightQuietly(height);
    this._iframeWrapperEl.style.height = `${height}px`;
  };

  render() {
    return (
      <div
        className="message-iframe-container"
        style={{ height: 0 }}
        ref={el => {
          this._iframeWrapperEl = el;
        }}
      >
        <EventedIFrame
          searchable
          sandbox="allow-forms allow-same-origin"
          seamless={true}
          style={{ height: 0 }}
          ref={cm => {
            this._iframeComponent = cm;
          }}
        />
      </div>
    );
  }
}
