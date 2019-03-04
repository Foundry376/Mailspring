import { RetinaImg } from 'mailspring-component-kit';
import { localized, localizedReactFragment, React } from 'mailspring-exports';

export default class InitialPreferencesPage extends React.Component {
  static displayName = 'InitialPreferencesPage';

  _onFinished = () => {
    require('electron').ipcRenderer.send('account-setup-successful');
  };

  render() {
    return (
      <div className="page opaque initial-subscription" style={{ width: 900, height: 620 }}>
        <h1 style={{ paddingTop: 100 }}>{localized(`Go further with Mailspring Pro`)}</h1>
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
              <div className="period">{localized(`Monthly`).toLocaleLowerCase()}</div>
            </div>
          </div>
          <div className="basic-explanation">
            <p>
              {localizedReactFragment(
                `You are using %@, which is free! You can link up to four email accounts and try pro features like send later, read receipts and reminders a few times a week.`,
                <strong>Mailspring Basic</strong>
              )}
            </p>
            <p>
              {localizedReactFragment(
                `If you enjoy Mailspring, upgrade to Mailspring Pro from %@ to enable all these great features permanently:`,
                <strong>{localized(`Preferences > Subscription`)}</strong>
              )}
            </p>
            <div className="features">
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Rich contact profiles`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Follow-up reminders`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Read Receipts`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Link tracking`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Powerful template support`)}
                </li>
              </ul>
              <ul>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Send Later`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Company overviews`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Snooze messages`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`Mailbox insights`)}
                </li>
                <li>
                  <RetinaImg
                    name="pro-feature-checkmark.png"
                    style={{ paddingRight: 8 }}
                    mode={RetinaImg.Mode.ContentDark}
                  />
                  {localized(`... and much more!`)}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <button className="btn btn-large" style={{ marginTop: 50 }} onClick={this._onFinished}>
          Finish Setup
        </button>
      </div>
    );
  }
}
