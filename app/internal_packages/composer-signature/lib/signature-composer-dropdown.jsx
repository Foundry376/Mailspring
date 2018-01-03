import { React, Actions, PropTypes, SignatureStore } from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown } from 'mailspring-component-kit';

import { applySignature, currentSignatureId } from './signature-utils';

export default class SignatureComposerDropdown extends React.Component {
  static displayName = 'SignatureComposerDropdown';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
    currentAccount: PropTypes.object,
    accounts: PropTypes.array,
  };

  constructor() {
    super();
    this.state = this._getStateFromStores();
  }

  componentDidMount = () => {
    this.unsubscribers = [SignatureStore.listen(this._onChange)];
  };

  componentDidUpdate(previousProps) {
    if (previousProps.currentAccount.id !== this.props.currentAccount.id) {
      const nextDefaultSignature = SignatureStore.signatureForEmail(
        this.props.currentAccount.email
      );
      this._onChangeSignature(nextDefaultSignature);
    }
  }

  componentWillUnmount() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _getStateFromStores() {
    const signatures = SignatureStore.getSignatures();
    return {
      signatures: signatures,
    };
  }

  _renderSigItem = sigItem => {
    return <span className={`signature-title-${sigItem.title}`}>{sigItem.title}</span>;
  };

  _onChangeSignature = sig => {
    let body;
    if (sig) {
      body = applySignature(this.props.draft.body, sig);
    } else {
      body = applySignature(this.props.draft.body, null);
    }
    this.props.session.changes.add({ body });
  };

  _isSelected = sigObj => {
    return currentSignatureId(this.props.draft.body) === sigObj.id;
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
    const header = [
      <div className="item item-none" key="none" onMouseDown={this._onClickNoSignature}>
        <span>No signature</span>
      </div>,
    ];
    const footer = [
      <div className="item item-edit" key="edit" onMouseDown={this._onClickEditSignatures}>
        <span>Edit Signatures...</span>
      </div>,
    ];

    const sigItems = Object.values(this.state.signatures);
    return (
      <Menu
        headerComponents={header}
        footerComponents={footer}
        items={sigItems}
        itemKey={sigItem => sigItem.id}
        itemContent={this._renderSigItem}
        onSelect={this._onChangeSignature}
        itemChecked={this._isSelected}
      />
    );
  }

  _renderSignatureIcon() {
    return (
      <RetinaImg
        className="signature-button"
        name="top-signature-dropdown.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
    );
  }

  render() {
    const sigs = this.state.signatures;
    const icon = this._renderSignatureIcon();

    if (Object.values(sigs).length > 0) {
      return (
        <div className="signature-button-dropdown">
          <ButtonDropdown primaryItem={icon} menu={this._renderSignatures()} bordered={false} />
        </div>
      );
    }
    return null;
  }
}
