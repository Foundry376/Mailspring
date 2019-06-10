import React from 'react';
import {
  localized,
  Actions,
  PropTypes,
  SignatureStore,
  DraftEditingSession,
  Account,
  ISignatureSet,
  MessageWithEditorState,
} from 'mailspring-exports';
import { Menu, RetinaImg, ButtonDropdown } from 'mailspring-component-kit';

import { applySignature, currentSignatureIdSlate } from './signature-utils';

const MenuItem = Menu.Item;

export default class SignatureComposerDropdown extends React.Component<
  {
    draft: MessageWithEditorState;
    draftFromEmail: string;
    session: DraftEditingSession;
    accounts: Account[];
  },
  { signatures: ISignatureSet }
> {
  static displayName = 'SignatureComposerDropdown';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    draftFromEmail: PropTypes.string,
    session: PropTypes.object.isRequired,
    accounts: PropTypes.array,
  };

  _staticIcon = (
    <RetinaImg
      className="signature-button"
      name="top-signature-dropdown.png"
      mode={RetinaImg.Mode.ContentIsMask}
    />
  );

  _staticFooterItems = [
    <div
      key="edit"
      className="item item-edit"
      onMouseDown={() => {
        Actions.switchPreferencesTab('Signatures');
        Actions.openPreferences();
      }}
    >
      <span>{localized('Edit Signatures...')}</span>
    </div>,
  ];

  unsubscribers: Array<() => void>;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
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

  _renderSignatures() {
    // note: these are using onMouseDown to avoid clearing focus in the composer (I think)
    const currentId = currentSignatureIdSlate(this.props.draft.bodyEditorState);

    return (
      <Menu
        headerComponents={[
          <MenuItem
            key={'none'}
            onMouseDown={() => this._onChangeSignature(null)}
            checked={!currentId}
            content={localized('No signature')}
          />,
        ]}
        footerComponents={this._staticFooterItems}
        items={Object.values(this.state.signatures)}
        itemKey={sig => sig.id}
        itemChecked={sig => currentId === sig.id}
        itemContent={sig => <span className={`signature-title-${sig.title}`}>{sig.title}</span>}
        onSelect={this._onChangeSignature}
      />
    );
  }

  render() {
    return (
      <div className="signature-button-dropdown">
        <ButtonDropdown
          bordered={false}
          primaryItem={this._staticIcon}
          menu={this._renderSignatures()}
        />
      </div>
    );
  }
}
