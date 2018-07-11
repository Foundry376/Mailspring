import {
  Utils,
  React,
  PropTypes,
  MessageUtils,
  MessageBodyProcessor,
  QuotedHTMLTransformer,
  AttachmentStore,
} from 'mailspring-exports';
import { InjectedComponentSet, RetinaImg } from 'mailspring-component-kit';

import EmailFrame from './email-frame';

const TransparentPixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNikAQAACIAHF/uBd8AAAAASUVORK5CYII=';

class ConditionalQuotedTextControl extends React.Component {
  static displayName = 'ConditionalQuotedTextControl';

  static propTypes = {
    body: PropTypes.string.isRequired,
    onClick: PropTypes.func,
  };

  shouldComponentUpdate(nextProps) {
    return this.props.body !== nextProps.body;
  }

  render() {
    if (!QuotedHTMLTransformer.hasQuotedHTML(this.props.body)) {
      return null;
    }
    return (
      <a className="quoted-text-control" onClick={this.props.onClick}>
        <span className="dots">&bull;&bull;&bull;</span>
      </a>
    );
  }
}

export default class MessageItemBody extends React.Component {
  static displayName = 'MessageItemBody';
  static propTypes = {
    message: PropTypes.object.isRequired,
    downloads: PropTypes.object.isRequired,
  };

  constructor(props, context) {
    super(props, context);
    this._mounted = false;
    this.state = {
      showQuotedText: this.props.message.isForwarded(),
      processedBody: MessageBodyProcessor.retrieveCached(this.props.message),
    };
  }

  componentWillMount() {
    const needInitialCallback = this.state.processedBody === null;
    this._unsub = MessageBodyProcessor.subscribe(
      this.props.message,
      needInitialCallback,
      processedBody => this.setState({ processedBody })
    );
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.message.id !== this.props.message.id) {
      if (this._unsub) {
        this._unsub();
      }
      this._unsub = MessageBodyProcessor.subscribe(nextProps.message, true, processedBody =>
        this.setState({ processedBody })
      );
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._unsub) {
      this._unsub();
    }
  }

  _onToggleQuotedText = () => {
    this.setState({
      showQuotedText: !this.state.showQuotedText,
    });
  };

  _mergeBodyWithFiles(body) {
    let merged = body;

    // Replace cid: references with the paths to downloaded files
    this.props.message.files.filter(f => f.contentId).forEach(file => {
      const download = this.props.downloads[file.id];
      const safeContentId = Utils.escapeRegExp(file.contentId);

      // Note: I don't like doing this with RegExp before the body is inserted into
      // the DOM, but we want to avoid "could not load cid://" in the console.

      if (download && download.state !== 'finished') {
        const inlineImgRegexp = new RegExp(
          `<\\s*img.*src=['"]cid:${safeContentId}['"][^>]*>`,
          'gi'
        );
        // Render a spinner
        merged = merged.replace(
          inlineImgRegexp,
          () =>
            '<img alt="spinner.gif" src="mailspring://message-list/assets/spinner.gif" style="-webkit-user-drag: none;">'
        );
      } else {
        const cidRegexp = new RegExp(`cid:${safeContentId}(@[^'"]+)?`, 'gi');
        merged = merged.replace(cidRegexp, `file://${AttachmentStore.pathForFile(file)}`);
      }
    });

    // Replace remaining cid: references - we will not display them since they'll
    // throw "unknown ERR_UNKNOWN_URL_SCHEME". Show a transparent pixel so that there's
    // no "missing image" region shown, just a space.
    merged = merged.replace(MessageUtils.cidRegex, `src="${TransparentPixel}"`);

    return merged;
  }

  _renderBody() {
    const { message } = this.props;
    const { showQuotedText, processedBody } = this.state;

    if (typeof message.body === 'string' && typeof processedBody === 'string') {
      return (
        <EmailFrame
          showQuotedText={showQuotedText}
          content={this._mergeBodyWithFiles(processedBody)}
          message={message}
        />
      );
    }

    return (
      <div className="message-body-loading">
        <RetinaImg
          name="inline-loading-spinner.gif"
          mode={RetinaImg.Mode.ContentDark}
          style={{ width: 14, height: 14 }}
        />
      </div>
    );
  }

  render() {
    return (
      <span>
        <InjectedComponentSet
          matching={{ role: 'message:BodyHeader' }}
          exposedProps={{ message: this.props.message }}
          direction="column"
          style={{ width: '100%' }}
        />
        {this._renderBody()}
        <ConditionalQuotedTextControl
          body={this.props.message.body || ''}
          onClick={this._onToggleQuotedText}
        />
      </span>
    );
  }
}
