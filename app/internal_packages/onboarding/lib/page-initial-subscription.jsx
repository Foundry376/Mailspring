import { RetinaImg, Flexbox } from 'mailspring-component-kit';
import { React, AccountStore } from 'mailspring-exports';

export default class InitialPreferencesPage extends React.Component {
  static displayName = 'InitialPreferencesPage';

  _onFinished = () => {
    require('electron').ipcRenderer.send('account-setup-successful');
  };

  render() {
    return (
      <div className="page opaque initial-subscription" style={{ width: 900, height: 620 }}>
        <h1 style={{ paddingTop: 100 }}>Go further with Mailspring Pro</h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            maxWidth: 750,
            margin: 'auto',
            textAlign: 'left',
            marginTop: 40,
          }}
        >
          <div>
            <div className="pro-feature-ring" style={{ marginRight: 40 }}>
              <RetinaImg name="pro-feature-ring.png" mode={RetinaImg.Mode.ContentPreserve} />
              <div className="price">$8</div>
              <div className="period">monthly</div>
            </div>
          </div>
          <div className="basic-explanation">
            <p>
              You are using <strong>Mailspring Basic</strong>, which is free! You can link up to
              four email accounts and try pro features like send later, read receipts and reminders
              a few times a week.
            </p>
            <p>
              If you enjoy Mailspring, upgrade to Mailspring Pro from{' '}
              <strong>Preferences > Subscription</strong> to enable all these great features
              permanently:
            </p>
            <div className="features">
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Rich contact profiles
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Follow-up reminders
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Read receipts
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Link tracking
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Powerful template support
                </li>
              </ul>
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Send later
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Company overviews
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Snooze messages
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />Mailbox insights
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />... and much more!
                </li>
              </ul>
            </div>
          </div>
        </div>

        <button
          className="btn btn-large btn-get-started"
          style={{ marginTop: 50 }}
          onClick={this._onFinished}
        >
          Finish Setup
        </button>
      </div>
    );
  }
}
