import { EventedIFrame } from 'mailspring-component-kit';
import React from 'react';
import ReactDOM from 'react-dom';
import { PropTypes, Utils, QuotedHTMLTransformer, MessageStore, Message } from 'mailspring-exports';
import { autolink } from './autolinker';
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

  _mounted: boolean = false;
  _unlisten: () => void;
  _iframeComponent: EventedIFrame;
  _iframeWrapperEl: HTMLDivElement;
  _iframeDocObserver: ResizeObserver;
  _lastFitSize: string = '';

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

  _emailContent = () => {
    // When showing quoted text, always return the pure content
    if (this.props.showQuotedText) {
      return this.props.content;
    }
    return QuotedHTMLTransformer.removeQuotedHTML(this.props.content, {
      keepIfWholeBodyIsQuote: true,
    });
  };

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
    const styles = EmailFrameStylesStore.styles();
    const restrictWidth = AppEnv.config.get('core.reading.restrictMaxWidth');

    doc.open();
    doc.write(
      `<!DOCTYPE html>` +
        (styles ? `<style>${styles}</style>` : '') +
        `<div id='inbox-html-wrapper' class="${process.platform}">${this._emailContent()}</div>`
    );
    doc.close();

    if (doc.body && restrictWidth) {
      doc.body.classList.add('restrict-width');
    }

    // Notify the EventedIFrame that we've replaced it's document (with `open`)
    // so it can attach event listeners again.
    this._lastFitSize = '';
    this._iframeComponent.didReplaceDocument();
    this._iframeDocObserver.observe(iframeEl.contentDocument.firstElementChild);

    window.requestAnimationFrame(() => {
      autolink(doc, { async: true });
      adjustImages(doc);

      for (const extension of MessageStore.extensions()) {
        if (!extension.renderedMessageBodyIntoDocument) {
          continue;
        }
        try {
          extension.renderedMessageBodyIntoDocument({
            document: doc,
            message: this.props.message,
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
    if (doc && doc.documentElement && doc.documentElement.scrollHeight > 0) {
      height = doc.documentElement.scrollHeight;
    } else if (doc && doc.body) {
      const style = window.getComputedStyle(doc.body);
      if (style.height === '0px') {
        doc.body.style.height = 'auto';
      }
      height = doc.body.scrollHeight;
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
