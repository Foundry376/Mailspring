import { EventedIFrame } from 'mailspring-component-kit';
import React from 'react';
import ReactDOM from 'react-dom';
import {
  Utils,
  localized,
  QuotedHTMLTransformer,
  MessageStore,
  Message,
  Autolink,
} from 'mailspring-exports';
import { adjustImages } from './adjust-images';
import EmailFrameStylesStore from './email-frame-styles-store';

// Emails that paint their own backgrounds (marketing tables, colored wrappers)
// or hardcode their text colors were designed for a white page and almost always
// assume the default text color is black, so we render them on white. Emails
// that do neither are rendered transparent with the theme's text color so they
// blend into the message list in dark themes.
//
// Backgrounds on inline elements are ignored so a highlighted word or styled
// link in an otherwise plain email doesn't force the white background. Link
// colors are ignored because nearly every email colors its links and the
// stylesheet already restyles them for the theme.
function isDesignedForWhiteBackground(wrapper: HTMLElement): boolean {
  const win = wrapper.ownerDocument.defaultView;
  if (!win) return false;
  const defaultColor = win.getComputedStyle(wrapper).color;

  for (const el of Array.from(wrapper.querySelectorAll<HTMLElement>('*'))) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none') continue;

    if (style.color !== defaultColor && !el.closest('a')) return true;

    if (style.display.startsWith('inline')) continue;
    if (style.backgroundImage !== 'none') return true;
    const bg = style.backgroundColor;
    if (bg && bg !== 'transparent' && !/^rgba\(\d+, \d+, \d+, 0\)$/.test(bg)) return true;
  }
  return false;
}

interface EmailFrameProps {
  content: string;
  showQuotedText: boolean;
  message: Message;
}

export default class EmailFrame extends React.Component<EmailFrameProps> {
  static displayName = 'EmailFrame';

  _mounted = false;
  _unlisten: () => void;
  _iframeComponent: EventedIFrame;
  _iframeWrapperEl: HTMLDivElement;
  _iframeDocObserver: ResizeObserver;
  _lastFitSize = '';

  componentDidMount() {
    this._mounted = true;
    this._iframeDocObserver = new window.ResizeObserver((entries) =>
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
    const { themeStyles, renderModeStyles } = EmailFrameStylesStore.styles();
    const restrictWidth = AppEnv.config.get('core.reading.restrictMaxWidth');

    let content = this.props.content;
    if (!showQuotedText && !message.plaintext) {
      content = QuotedHTMLTransformer.removeQuotedHTML(content, {
        keepIfWholeBodyIsQuote: true,
      });
    }

    doc.open();

    if (message.plaintext) {
      doc.write(
        `<!DOCTYPE html>` +
          `<style>${themeStyles}</style>` +
          `<div id='inbox-plain-wrapper' class="${process.platform}"></div>`
      );
      doc.close();
      const plainWrapper = doc.getElementById('inbox-plain-wrapper');
      plainWrapper.innerText = content;
      plainWrapper.setAttribute('role', 'document');
    } else {
      doc.write(
        `<!DOCTYPE html>` +
          `<style>${themeStyles || ''}\n${renderModeStyles || ''}</style>` +
          `<div id='inbox-html-wrapper' class="${process.platform}">${content}</div>`
      );
      doc.close();
      const htmlWrapper = doc.getElementById('inbox-html-wrapper');
      if (htmlWrapper) {
        htmlWrapper.setAttribute('role', 'document');
        try {
          htmlWrapper.classList.toggle('has-background', isDesignedForWhiteBackground(htmlWrapper));
        } catch (e) {
          AppEnv.reportError(e);
        }
      }
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
      // Guard: component may have unmounted or _writeContent called again (calling
      // doc.open() a second time), leaving doc.body null until the next doc.write().
      if (!this._mounted || !doc.body) return;

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
          const name = (extension as any).displayName || (extension as any).name || 'unknown';
          AppEnv.reportError(e, { extensionName: name });
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
        ref={(el) => {
          this._iframeWrapperEl = el;
        }}
      >
        <EventedIFrame
          searchable
          sandbox="allow-forms allow-same-origin"
          seamless={true}
          title={localized('Email message')}
          style={{ height: 0 }}
          ref={(cm) => {
            this._iframeComponent = cm;
          }}
        />
      </div>
    );
  }
}
