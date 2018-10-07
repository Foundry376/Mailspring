import {
  localized,
  MailspringAPIRequest,
  React,
  WorkspaceStore,
  ComponentRegistry,
} from 'mailspring-exports';
import { remote } from 'electron';

class SubmitLocalizationsBar extends React.Component {
  static displayName = 'SubmitLocalizationsBar';

  state = {
    current: '',
    proposed: '',
    selecting: false,
  };

  componentWillUnmount() {
    document.removeEventListener('click', this.onSelectionBogusClick, true);
    document.removeEventListener('mousedown', this.onSelectionMouseDown);
  }

  onSubmit = async () => {
    const { current, proposed } = this.state;

    try {
      const { status } = await MailspringAPIRequest.makeRequest({
        server: 'identity',
        method: 'POST',
        body: { current, proposed, language: window.navigator.language },
        path: '/api/localization-suggestion',
        json: true,
      });
      if (status === 'success') {
        remote.dialog.showMessageBox({
          type: 'info',
          buttons: [localized('OK')],
          message: localized('Thank You!'),
          title: localized('Thank You!'),
          detail: localized(
            `Your updated localization will be reviewed and included in a future version of Mailspring.`
          ),
        });
      }
    } catch (err) {
      AppEnv.showErrorDialog(err.toString());
    }
  };

  onSelectionBogusClick = event => {
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('click', this.onSelectionBogusClick, true);
  };

  onSelectionMouseDown = event => {
    let text = null;
    const element = document.elementFromPoint(event.clientX, event.clientY);

    if (element) {
      if (element.nodeName === 'INPUT') {
        if (element.value) {
          text = element.value;
        } else {
          text = element.placeholder;
        }
      } else if (element.innerText.length > 0) {
        text = element.innerText;
      } else {
        const parent = element.closest('[title]');
        text = parent ? parent.title : '';
      }
    }

    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('mousedown', this.onSelectionMouseDown);
    if (text && text.length) {
      this.setState({ selecting: false, current: text, proposed: text });
    } else {
      this.setState({ selecting: false });
    }
  };

  onToggleSelectionMode = () => {
    if (this.state.selecting) {
      document.removeEventListener('mousedown', this.onSelectionMouseDown);
      document.removeEventListener('click', this.onSelectionBogusClick, true);
      this.setState({ selecting: false });
    } else {
      document.addEventListener('mousedown', this.onSelectionMouseDown);
      document.addEventListener('click', this.onSelectionBogusClick, true);
      this.setState({ selecting: true });
    }
  };

  render() {
    const { selecting, current, proposed } = this.state;

    return (
      <div style={{ height: 40, background: 'moccasin' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: 10 }}>
          <span style={{ marginRight: 10, flex: 1 }}>
            {localized('Submit Improved Localizations')} ({window.navigator.language})
          </span>
          <button
            className="btn"
            style={selecting ? { border: '1px solid black' } : {}}
            onClick={this.onToggleSelectionMode}
          >
            <img
              alt="icon"
              src={'mailspring://localizer-help/assets/choose-element.png'}
              style={{ width: 13 }}
            />
          </button>
          <input
            type="text"
            style={{ flex: 1 }}
            value={current}
            placeholder={localized('Existing')}
            onChange={e => this.setState({ current: e.target.value })}
          />
          <span style={{ margin: 10 }}>=</span>
          <input
            type="text"
            style={{ flex: 1 }}
            value={proposed}
            placeholder={localized('Localized')}
            onChange={e => this.setState({ proposed: e.target.value })}
          />
          <button onClick={this.onSubmit} className="btn" type="submit" style={{ marginLeft: 10 }}>
            {localized('Submit')}
          </button>
        </div>
      </div>
    );
  }
}

let visible = false;

export function activate() {
  AppEnv.commands.add(document.body, 'window:toggle-localizer-tools', () => {
    if (!visible) {
      ComponentRegistry.register(SubmitLocalizationsBar, {
        location: WorkspaceStore.Sheet.Global.Header,
      });
    } else {
      ComponentRegistry.unregister(SubmitLocalizationsBar);
    }

    visible = !visible;
  });
}

export function deactivate() {
  if (visible) {
    ComponentRegistry.unregister(SubmitLocalizationsBar);
  }
}
