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
import { shell } from 'electron';
import fs from 'fs';
import sharp from 'sharp';

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
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (
      nextProps.message.id === this.props.message.id &&
      nextProps.content === this.props.content &&
      nextProps.message.version > this.props.message.version
    ) {
      this._writeContent();
    }
  }

  shouldComponentUpdate(nextProps) {
    const { content, showQuotedText, message = {} } = this.props;
    const nextMessage = nextProps.message || {};

    return (
      content !== nextProps.content ||
      showQuotedText !== nextProps.showQuotedText ||
      message.id !== nextMessage.id ||
      (message.id === nextMessage.id &&
        nextMessage.version > message.version &&
        content === nextProps.content) ||
      !Utils.isEqualReact(message.pluginMetadata, nextMessage.pluginMetadata)
    );
  }

  componentDidUpdate() {
    this._writeContent();
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._unlisten) {
      this._unlisten();
    }
    const iframeNode = ReactDOM.findDOMNode(this._iframeComponent);
    if (iframeNode) {
      iframeNode.removeEventListener('load', this._onLoad);
    }
  }

  _emailContent = (isPlainBody = false) => {
    // When showing quoted text, always return the pure content
    if (this.props.showQuotedText || isPlainBody) {
      return this.props.content;
    }
    return QuotedHTMLTransformer.removeQuotedHTML(this.props.content, {
      keepIfWholeBodyIsQuote: true,
    });
  };

  _writeContent = () => {
    const iframeNode = ReactDOM.findDOMNode(this._iframeComponent);
    if (!iframeNode) {
      return;
    }
    const doc = iframeNode.contentDocument;
    if (!doc) {
      return;
    }
    const { isPlainText = 0 } = this.props.message;
    const isPlainBody = isPlainText === 1;
    // const isPlainBody = body && body.trim().replace(/(\r\n|\r|\n)/g, ' ').substr(0, 20) == snippet.trim().substr(0, 20);
    doc.open();

    // NOTE: The iframe must have a modern DOCTYPE. The lack of this line
    // will cause some bizzare non-standards compliant rendering with the
    // message bodies. This is particularly felt with <table> elements use
    // the `border-collapse: collapse` css property while setting a
    // `padding`.
    doc.write('<!DOCTYPE html>');
    const styles = EmailFrameStylesStore.styles();
    if (styles) {
      doc.write(`<style>${styles}</style>`);
    }
    doc.write(`<style> body {display: block!important; visibility: visible!important;} </style>`);
    if (isPlainBody) {
      doc.write(`
      <style>
        #inbox-html-wrapper {
          white-space: pre-wrap;
        }
      </style>
      `);
    }
    doc.write(
      `<div id='inbox-html-wrapper' class="${process.platform}">${this._emailContent(
        isPlainBody
      )}</div>`
    );
    doc.close();

    iframeNode.addEventListener('load', this._onLoad);

    autolink(doc, { async: true });
    adjustImages(doc);

    // dark mode
    // when dark mode, inverse content
    if (AppEnv.config.get('core.theme') === 'ui-dark') {
      this.applyDarkMode(doc);
    }

    for (const extension of MessageStore.extensions()) {
      if (!extension.renderedMessageBodyIntoDocument) {
        continue;
      }
      try {
        extension.renderedMessageBodyIntoDocument({
          document: doc,
          message: this.props.message,
          iframe: iframeNode,
        });
      } catch (e) {
        AppEnv.reportError(e);
      }
    }

    // Notify the EventedIFrame that we've replaced it's document (with `open`)
    // so it can attach event listeners again.
    this._iframeComponent.didReplaceDocument();
    this._onMustRecalculateFrameHeight();
  };

  _onLoad = () => {
    if (!this._mounted) {
      return;
    }
    const iframeNode = ReactDOM.findDOMNode(this._iframeComponent);
    if (!iframeNode) {
      return;
    }
    iframeNode.removeEventListener('load', this._onLoad);
    this._setFrameHeight();

    // double click can open the file
    const doc = iframeNode.contentDocument;
    const inlineImgs = doc.querySelectorAll('.inline-image');
    if (inlineImgs && inlineImgs.length > 0) {
      for (let i = 0; i < inlineImgs.length; i++) {
        inlineImgs[i].ondblclick = this._openInlineImage;
      }
    }

    // img fallback
    const imgFallbackList = doc.querySelectorAll('img');
    imgFallbackList.forEach(async img => {
      if (img.src !== '' && (img.height === 0 || img.width === 0)) {
        let fallbackSrc;
        if (/^file:\/\/.*\.tiff$/.test(img.src)) {
          fallbackSrc = await this._transformTiffToPng(img.src);
        }
        if (fallbackSrc) {
          img.src = fallbackSrc;
        } else {
          img.src = '../static/images/chat/image-not-found.png';
          img.height = 25;
          img.width = 25;
        }
      }
    });
  };

  _openInlineImage(e) {
    if (e.target) {
      shell.openItem(decodeURIComponent(e.target.src.replace('file://', '')));
    }
  }

  _transformTiffToPng = async src => {
    const filePath = decodeURIComponent(src.replace('file://', ''));
    const newFilePath = filePath.replace(/\.tiff$/, '.png');
    try {
      // has new .png file, return new path
      fs.accessSync(newFilePath, fs.constants.R_OK);
      return newFilePath;
    } catch (err) {
      // dont has new .png file, transform old file
      try {
        fs.accessSync(filePath, fs.constants.R_OK);
        const fileBuffer = await sharp(filePath)
          .png()
          .toBuffer();
        fs.writeFileSync(newFilePath, fileBuffer);
        fs.accessSync(newFilePath, fs.constants.R_OK);
        return newFilePath;
      } catch (err) {
        return '';
      }
    }
  };

  _onMustRecalculateFrameHeight = () => {
    this._iframeComponent.setHeightQuietly(0);
    this._lastComputedHeight = 0;
    this._setFrameHeight();
    // 10 seconds later, force execute it again;
    setTimeout(this._setFrameHeight, 10 * 1000);
  };

  _getFrameHeight = doc => {
    let height = 0;

    // If documentElement has a scroll height, prioritize that as height
    // If not, fall back to body scroll height by setting it to auto
    if (doc && doc.documentElement && doc.documentElement.scrollHeight > 0) {
      height = doc.documentElement.scrollHeight;
    } else if (doc && doc.body) {
      const style = window.getComputedStyle(doc.body);
      if (style.height === '0px') {
        doc.body.style.height = 'auto';
      }
      height = doc.body.scrollHeight;
    }
    return height;
  };

  _setFrameHeight = () => {
    if (!this._mounted) {
      return;
    }

    // Q: What's up with this holder?
    // A: If you resize the window, or do something to trigger setFrameHeight
    // on an already-loaded message view, all the heights go to zero for a brief
    // second while the heights are recomputed. This causes the ScrollRegion to
    // reset it's scrollTop to ~0 (the new combined heiht of all children).
    // To prevent this, the holderNode holds the last computed height until
    // the new height is computed.
    const iframeNode = ReactDOM.findDOMNode(this._iframeComponent);
    let height = this._getFrameHeight(iframeNode.contentDocument);

    // Why 5px? Some emails have elements with a height of 100%, and then put
    // tracking pixels beneath that. In these scenarios, the scrollHeight of the
    // message is always <100% + 1px>, which leads us to resize them constantly.
    // This is a hack, but I'm not sure of a better solution.
    if (Math.abs(height - this._lastComputedHeight) > 5) {
      this._iframeComponent.setHeightQuietly(height);
      this._iframeHeightHolderEl.style.height = `${height}px`;
      this._lastComputedHeight = height;
    }

    if (iframeNode.contentDocument.readyState !== 'complete') {
      window.requestAnimationFrame(() => {
        this._setFrameHeight();
      });
    }
    // all images are loaded
    iframeNode.contentWindow.onload = () => {
      window.requestAnimationFrame(() => {
        this._setFrameHeight();
      });
    };
  };

  RGBColor = (s) => {
    s = s.split('(')[1];
    const ns = s.substring(0, s.length - 1).split(',');
    return ns.map(n => +n.trim());
  }

  reversedColor = (r, g, b, prop) => {
    var isBackground = prop == 'background-color';
    //if color is dark or bright (http://alienryderflex.com/hsp.html)
    var hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    if (hsp < 130 && !isBackground) { //foreground dark color
      var delta = 255 - hsp;
      var nr = Math.min(r + delta, 234);
      var ng = Math.min(g + delta, 234);
      var nb = Math.min(b + delta, 234);
      return 'rgb(' + nr + ',' + ng + ', ' + nb + ')';
    } else if (hsp > 200 && isBackground) { //bg color brighter than #cccccc
      var nr = Math.max(r - hsp, 27);
      var ng = Math.max(g - hsp, 28);
      var nb = Math.max(b - hsp, 30);
      return 'rgb(' + nr + ',' + ng + ', ' + nb + ')';
    } else {
      return this.desatruate(r, g, b);
    }
  }

  desatruate = (r, g, b) => {
    var gray = r * 0.3086 + g * 0.6094 + b * 0.0820;
    var sat = 0.8; //80%
    var nr = Math.round(r * sat + gray * (1 - sat));
    var ng = Math.round(g * sat + gray * (1 - sat));
    var nb = Math.round(b * sat + gray * (1 - sat));
    return 'rgb(' + nr + ',' + ng + ', ' + nb + ')';
  }

  applyDarkMode = doc => {
    var colorProperties = ['color', 'background-color'];
    Array.from(doc.querySelectorAll('*')).reverse().forEach(node => {
      for (var prop in colorProperties) {
        var style = window.getComputedStyle(node, null);
        prop = colorProperties[prop];

        if (!style[prop]) continue;

        const [r, g, b, a] = this.RGBColor(style[prop]);
        if (a == 0) continue; //transparent;

        node.style.setProperty(prop, this.reversedColor(r, g, b, prop), 'important');
      }
    });
  }

  render() {
    return (
      <div
        className="iframe-container"
        ref={el => {
          this._iframeHeightHolderEl = el;
        }}
        style={{ height: this._lastComputedHeight }}
      >
        <EventedIFrame
          ref={cm => {
            this._iframeComponent = cm;
          }}
          seamless="seamless"
          searchable
          onResize={this._onMustRecalculateFrameHeight}
        />
      </div>
    );
  }
}
