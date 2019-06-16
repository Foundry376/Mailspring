/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React from 'react';
import ReactDOM from 'react-dom';
import {
  Rx,
  PropTypes,
  Thread,
  DatabaseStore,
  localized,
  FeatureUsageStore,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import CopyButton from './copy-button';
import { sharingURLForThread, syncThreadToWeb, unsyncThread } from './main';

export default class ThreadSharingPopover extends React.Component<
  {
    thread: Thread;
    accountId: string;
  },
  { saving: boolean; url: string }
> {
  static propTypes = {
    thread: PropTypes.object,
    accountId: PropTypes.string,
  };

  _mounted: boolean = false;
  _disposable?: any;

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
    this._disposable = Rx.Observable.fromQuery(
      DatabaseStore.find<Thread>(Thread, thread.id)
    ).subscribe(t => {
      if (!t) return;
      this.setState({ url: sharingURLForThread(t) });
    });
  }

  componentDidUpdate() {
    (ReactDOM.findDOMNode(this) as HTMLElement).focus();
  }

  componentWillUnmount() {
    this._disposable.dispose();
    this._mounted = false;
  }

  _onToggleShared = async () => {
    this.setState({ saving: true });

    let nextUrl = null;

    try {
      if (!this.state.url) {
        try {
          await FeatureUsageStore.markUsedOrUpgrade('thread-sharing', {
            headerText: localized('All Sharing Links Used'),
            rechargeText: `${localized(
              `You can share %1$@ emails each %2$@ with Mailspring Basic.`
            )} ${localized('Upgrade to Pro today!')}`,
            iconUrl: 'mailspring://thread-sharing/assets/ic-modal-image@2x.png',
          });
        } catch (error) {
          if (error instanceof FeatureUsageStore.NoProAccessError) {
            if (this._mounted) this.setState({ saving: false });
            return;
          }
        }

        await syncThreadToWeb(this.props.thread);
        nextUrl = sharingURLForThread(this.props.thread);
      } else {
        await unsyncThread(this.props.thread);
        nextUrl = null;
      }
    } catch (error) {
      AppEnv.reportError(error);
      AppEnv.showErrorDialog(
        localized(
          `Sorry, we were unable to contact the Mailspring servers to share this thread.\n\n%@`,
          error.message
        )
      );
    }

    if (!this._mounted) {
      return;
    }
    this.setState({ saving: false, url: nextUrl });
  };

  _onClickInput = event => {
    event.target.select();
  };

  render() {
    const { url, saving } = this.state;

    // tabIndex is necessary for the popover's onBlur events to work properly
    return (
      <div tabIndex={1} className={`thread-sharing-popover ${!url && 'disabled'}`}>
        <div className="share-toggle">
          {saving ? (
            <label htmlFor="shareCheckbox">
              <RetinaImg
                style={{ width: 14, height: 14, marginBottom: 3, marginRight: 4 }}
                name="inline-loading-spinner.gif"
                mode={RetinaImg.Mode.ContentPreserve}
              />
              {localized('Syncing') + '...'}
              <div className="meta">
                {localized(
                  `Mailspring is syncing this thread and it's attachments to the cloud. For long threads, this may take a moment.`
                )}
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
              {localized('Share this thread')}
              <div className="meta">
                {localized(
                  'Sync this conversation to the cloud and anyone with the secret link can read it and download attachments.'
                )}
              </div>
            </label>
          )}
          <div className="meta">
            <a href="https://foundry376.zendesk.com/hc/en-us/articles/360002360771">
              {localized('Learn More')}
            </a>
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
          <a href={url} style={{ marginRight: 10 }}>
            <button className="btn" disabled={!url}>
              {localized('Open In Browser')}
            </button>
          </a>
          <CopyButton
            className="btn"
            disabled={!url}
            copyValue={url}
            btnLabel={localized('Copy link')}
          />
        </div>
      </div>
    );
  }
}
