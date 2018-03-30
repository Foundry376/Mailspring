/* eslint jsx-a11y/tabindex-no-positive: 0 */
import { Rx, React, ReactDOM, PropTypes, Thread, DatabaseStore } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import CopyButton from './copy-button';
import { isShared, sharingURLForThread, syncThreadToWeb, unsyncThread } from './main';

export default class ThreadSharingPopover extends React.Component {
  static propTypes = {
    thread: PropTypes.object,
    accountId: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      url: sharingURLForThread(props.thread),
      saving: false,
    };
    this._disposable = { dispose: () => {} };
  }

  componentDidMount() {
    const { thread } = this.props;
    this._mounted = true;
    this._disposable = Rx.Observable.fromQuery(DatabaseStore.find(Thread, thread.id)).subscribe(t =>
      this.setState({ url: sharingURLForThread(t) })
    );
  }

  componentDidUpdate() {
    ReactDOM.findDOMNode(this).focus();
  }

  componentWillUnmount() {
    this._disposable.dispose();
    this._mounted = false;
  }

  _onToggleShared = async () => {
    const { thread } = this.props;

    this.setState({ saving: true });

    try {
      if (!isShared(thread)) {
        await syncThreadToWeb(thread);
      } else {
        await unsyncThread(thread);
      }
    } catch (error) {
      AppEnv.reportError(error);
      AppEnv.showErrorDialog(
        `Sorry, we were unable to contact the Mailspring servers to share this thread.\n\n${
          error.message
        }`
      );
    }

    if (!this._mounted) {
      return;
    }
    this.setState({ saving: false, url: sharingURLForThread(thread) });
  };

  _onClickInput = event => {
    event.target.select();
  };

  render() {
    const { url, saving } = this.state;

    // tabIndex is necessary for the popover's onBlur events to work properly
    return (
      <div tabIndex="1" className={`thread-sharing-popover ${!url && 'disabled'}`}>
        <div className="share-toggle">
          {saving ? (
            <label htmlFor="shareCheckbox">
              <RetinaImg
                style={{ width: 14, height: 14, marginBottom: 3, marginRight: 4 }}
                name="inline-loading-spinner.gif"
                mode={RetinaImg.Mode.ContentPreserve}
              />
              Syncing...
              <div className="meta">
                Mailspring is syncing this thread and it's attachments to the cloud. For long
                threads, this may take a moment.
              </div>
            </label>
          ) : (
            <label htmlFor="shareCheckbox">
              <input
                type="checkbox"
                id="shareCheckbox"
                checked={!!url}
                onChange={this._onToggleShared}
              />
              Share this thread
              <div className="meta">
                Sync this conversation to the cloud and anyone with the secret link can read it and
                download attachments.
              </div>
            </label>
          )}
          <div className="meta">
            <a href="http://foundry376.zendesk.com">Learn More</a>
          </div>
        </div>
        <div className="share-input">
          <input
            ref="urlInput"
            id="urlInput"
            type="text"
            value={url || ''}
            readOnly
            disabled={!url}
            onClick={this._onClickInput}
          />
        </div>
        <div className="share-controls">
          <button href={url} className="btn" disabled={!url}>
            Open in browser
          </button>
          <CopyButton className="btn" disabled={!url} copyValue={url} btnLabel="Copy link" />
        </div>
      </div>
    );
  }
}
