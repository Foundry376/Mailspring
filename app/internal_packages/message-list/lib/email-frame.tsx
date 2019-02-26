import { EventedIFrame } from 'mailspring-component-kit';
import {
  React,
  ReactDOM,
  PropTypes,
  Utils,
  QuotedHTMLTransformer,
  MessageStore,
} from 'mailspring-exports';
import { autolink } from './autolinker';
import { adjustImages } from './adjust-images';
import EmailFrameStylesStore from './email-frame-styles-store';

export default class EmailFrame extends React.Component {
  static displayName = 'EmailFrame';

  static propTypes = {
    content: PropTypes.string.isRequired,
    message: PropTypes.object,
    showQuotedText: PropTypes.bool,
  };

  componentDidMount() {
    this._mounted = true;
    this._writeContent();
    this._unlisten = EmailFrameStylesStore.listen(this._writeContent);

    // Update the iframe's size whenever it's content size changes. Doing this
    // with ResizeObserver is /so/ elegant compared to polling for it's height.
    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent);
    this._iframeDocObserver = new ResizeObserver(this._onReevaluateContentSize);
    this._iframeDocObserver.observe(iframeEl.contentDocument.firstElementChild);
  }

  shouldComponentUpdate(nextProps) {
    const { content, showQuotedText, message = {} } = this.props;
    const nextMessage = nextProps.message || {};

    return (
      message.id !== nextMessage.id ||
      content !== nextProps.content ||
      showQuotedText !== nextProps.showQuotedText ||
      !Utils.isEqualReact(message.pluginMetadata, nextMessage.pluginMetadata)
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
    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent);
    const doc = iframeEl.contentDocument;
    if (!doc) return;

    // NOTE: The iframe must have a modern DOCTYPE. The lack of this line
    // will cause some bizzare non-standards compliant rendering with the
    // message bodies. This is particularly felt with <table> elements use
    // the `border-collapse: collapse` css property while setting a
    // `padding`.
    const styles = EmailFrameStylesStore.styles();
    doc.open();
    doc.write(
      `<!DOCTYPE html>` +
        (styles ? `<style>${styles}</style>` : '') +
        `<div id='inbox-html-wrapper' class="${process.platform}">${this._emailContent()}</div>`
    );
    doc.close();

    // Notify the EventedIFrame that we've replaced it's document (with `open`)
    // so it can attach event listeners again.
    this._iframeComponent.didReplaceDocument();

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

  _onReevaluateContentSize = () => {
    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent);
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
  };

  _onResize = () => {
    const iframeEl = ReactDOM.findDOMNode(this._iframeComponent);
    if (!iframeEl) return;
    this._iframeDocObserver.disconnect();
    this._iframeDocObserver.observe(iframeEl.contentDocument.firstElementChild);
  };

  render() {
    return (
      <EventedIFrame
        searchable
        onResize={this._onResize}
        seamless="seamless"
        style={{ height: 0 }}
        ref={cm => {
          this._iframeComponent = cm;
        }}
      />
    );
  }
}
