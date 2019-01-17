import { React, Actions, PropTypes, SignatureStore } from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown } from 'mailspring-component-kit';

import { applySignature, currentSignatureId } from './signature-utils';

export default class SignatureComposerDropdown extends React.Component {
  static displayName = 'SignatureComposerDropdown';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    draftFromEmail: PropTypes.string,
    session: PropTypes.object.isRequired,
    accounts: PropTypes.array,
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();

    this._staticIcon = (
      <RetinaImg
        className="signature-button"
        name="top-signature-dropdown.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
    );
    this._staticHeaderItems = [
      <div className="item item-none" key="none" onMouseDown={this._onClickNoSignature}>
        <span>No signature</span>
      </div>,
    ];
    this._staticFooterItems = [
      <div className="item item-edit" key="edit" onMouseDown={this._onClickEditSignatures}>
        <span>Edit Signatures...</span>
      </div>,
    ];
  }

  componentDidMount = () => {
    this.unsubscribers = [
      SignatureStore.listen(() => {
        this.setState(this._getStateFromStores());
      }),
    ];
  };

  componentDidUpdate(previousProps) {
    if (previousProps.draftFromEmail !== this.props.draftFromEmail) {
      const nextDefaultSignature = SignatureStore.signatureForEmail(this.props.draftFromEmail);
      window.requestAnimationFrame(() => {
        this._onChangeSignature(nextDefaultSignature);
      });
    }
  }

  componentWillUnmount() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  _getStateFromStores() {
    return {
      signatures: SignatureStore.getSignatures(),
    };
  }

  _onChangeSignature = sig => {
    let body;
    if (sig) {
      body = applySignature(this.props.draft.body, sig);
    } else {
      body = applySignature(this.props.draft.body, null);
    }
    this.props.session.changes.add({ body });
  };

  _onClickNoSignature = () => {
    this._onChangeSignature(null);
  };

  _onClickEditSignatures() {
    Actions.switchPreferencesTab('Signatures');
    Actions.openPreferences();
  }

  _renderSignatures() {
    // note: these are using onMouseDown to avoid clearing focus in the composer (I think)

    return (
      <Menu
        headerComponents={this._staticHeaderItems}
        footerComponents={this._staticFooterItems}
        items={Object.values(this.state.signatures)}
        itemKey={sig => sig.id}
        itemChecked={sig => currentSignatureId(this.props.draft.body) === sig.id}
        itemContent={sig => <span className={`signature-title-${sig.title}`}>{sig.title}</span>}
        onSelect={this._onChangeSignature}
      />
    );
  }

  render() {
    return (
      <div className="signature-button-dropdown">
        <ButtonDropdown
          disabled={this.props.session.isPopout()}
          bordered={false}
          primaryItem={this._staticIcon}
          menu={this._renderSignatures()}
        />
      </div>
    );
  }
}
