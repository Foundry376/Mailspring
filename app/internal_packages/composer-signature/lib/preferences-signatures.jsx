import { remote } from 'electron';
import {
  React,
  ReactDOM,
  AccountStore,
  SignatureStore,
  Actions,
  FocusedPerspectiveStore,
  Utils,
} from 'mailspring-exports';
import { Flexbox, EditableList, ComposerEditor, ComposerSupport } from 'mailspring-component-kit';
import { ResolveSignatureData, RenderSignatureData } from './constants';
import SignatureAccountDefaultPicker from './signature-account-default-picker';
import Templates from './templates';

const {
  Conversion: { convertFromHTML, convertToHTML },
} = ComposerSupport;

class SignatureEditor extends React.Component {
  constructor(props) {
    super(props);
    const body = props.signature ? props.signature.body : '';
    this.state = {
      editorState: convertFromHTML(body),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const body = nextProps.signature ? nextProps.signature.body : '';
    this.setState({
      editorState: convertFromHTML(body),
    });
  }

  _onBaseFieldChange = event => {
    const { id, value } = event.target;
    const sig = this.props.signature;
    Actions.upsertSignature(Object.assign({}, sig, { [id]: value }), sig.id);
  };

  _onSave = () => {
    const sig = Object.assign({}, this.props.signature);
    sig.body = convertToHTML(this.state.editorState);
    Actions.upsertSignature(sig, sig.id);
  };

  _onFocusEditor = e => {
    if (e.target === ReactDOM.findDOMNode(this._composer)) {
      this._composer.focusEndAbsolute();
    }
  };

  render() {
    const { accountsAndAliases, defaults } = this.props;
    const { editorState } = this.state;

    let signature = this.props.signature;
    let empty = false;
    if (!signature) {
      signature = { data: { templateName: Templates[0].name } };
      empty = true;
    }
    const data = signature.data || {};
    const resolvedData = ResolveSignatureData(data);

    return (
      <div className={`signature-wrap ${empty && 'empty'}`}>
        <div className="section basic-info">
          <input
            key="signatureName"
            type="text"
            id="title"
            placeholder="Name"
            value={signature.title || ''}
            onChange={this._onBaseFieldChange}
          />
        </div>

        <div className="section editor" onClick={this._onFocusEditor}>
          <ComposerEditor
            ref={c => (this._composer = c)}
            readOnly={false}
            value={editorState}
            propsForPlugins={{}}
            onChange={change => {
              const changeHtml = convertToHTML(change.value);
              if (changeHtml) {
                this.setState({ editorState: change.value });
              } else {
                this.setState({ editorState: convertFromHTML('<br />') });
              }
            }}
            onBlur={this._onSave}
            onFileReceived={() => {
              // This method ensures that HTML can be pasted.
            }}
          />
        </div>
        <SignatureAccountDefaultPicker
          signature={signature}
          accountsAndAliases={accountsAndAliases}
          defaults={defaults}
        />
        {/*TODO: edison feature disabled*/}
        {/*<SignaturePhotoPicker*/}
        {/*id={signature.id}*/}
        {/*data={data}*/}
        {/*resolvedURL={resolvedData.photoURL}*/}
        {/*onChange={this._onDataFieldChange}*/}
        {/*/>*/}
      </div>
    );
  }
}

export default class PreferencesSignatures extends React.Component {
  static displayName = 'PreferencesSignatures';

  constructor() {
    super();
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribers = [SignatureStore.listen(this._onChange)];
  }

  componentWillUnmount() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _getStateFromStores() {
    return {
      signatures: SignatureStore.getSignatures(),
      selectedSignature: SignatureStore.selectedSignature(),
      defaults: SignatureStore.getDefaults(),
      accountsAndAliases: AccountStore.aliases(),
    };
  }

  _onAddSignature = () => {
    const activeIds = FocusedPerspectiveStore.current().accountIds || AccountStore.accountIds();
    const activeAccount = AccountStore.accountForId(activeIds[0]);
    const id = Utils.generateTempId();

    // let data = {};
    // let body = null;
    // if (this.state.selectedSignature) {
    //   data = Object.assign({}, this.state.selectedSignature.data);
    //   body = this.state.selectedSignature.body;
    // } else {
    //   data = {
    //     templateName: Templates[0].name,
    //     name: activeAccount.name,
    //     email: activeAccount.emailAddress,
    //   };
    //   body = RenderSignatureData(data);
    // }
    const data = {
      templateName: Templates[0].name,
      name: activeAccount.name,
      email: activeAccount.emailAddress,
    };
    const body = RenderSignatureData(data);

    Actions.upsertSignature({ id, title: 'Untitled', body, data }, id);
    Actions.selectSignature(id);
  };

  _onDeleteSignature = signature => {
    Actions.removeSignature(signature);
  };

  _onEditSignatureTitle = nextTitle => {
    const { title, ...rest } = this.state.selectedSignature;
    Actions.upsertSignature({ title: nextTitle, ...rest }, rest.id);
  };

  _onSelectSignature = sig => {
    Actions.selectSignature(sig.id);
  };

  _renderSig = sig => {
    const checkedList = this.state.accountsAndAliases.filter(
      account => this.state.defaults[account.email] === sig.id
    );
    const checkedListLen = checkedList && checkedList.length ? checkedList.length : 0;

    return (
      <div className="signatures">
        <div className="title">{sig.title}</div>
        <div className="use-account">
          {checkedListLen
            ? `${checkedListLen} account${checkedListLen > 1 ? 's' : ''}`
            : 'Not currently in use'}
        </div>
      </div>
    );
  };

  _renderSignatures() {
    const sigArr = Object.values(this.state.signatures);
    const footer = (
      <div className="buttons-wrapper" onClick={this._onAddSignature}>
        +&nbsp;&nbsp;&nbsp;&nbsp;New Signature
      </div>
    );
    return (
      <div>
        <div className="config-group">
          <h6>SIGNATURES</h6>
          <div className="signatures-note">
            Create email signatures to automatically add to the end of your messages. You can format
            your message be adding images or changing the text style. Add a different signature for
            each account, or use the same one for several accounts.
          </div>
        </div>
        <Flexbox>
          <EditableList
            className="signature-list"
            items={sigArr}
            itemContent={this._renderSig}
            onCreateItem={this._onAddSignature}
            onDeleteItem={this._onDeleteSignature}
            onItemEdited={this._onEditSignatureTitle}
            onSelectItem={this._onSelectSignature}
            selected={this.state.selectedSignature}
            footer={footer}
            showDelIcon
          />
          <SignatureEditor
            signature={this.state.selectedSignature}
            defaults={this.state.defaults}
            accountsAndAliases={this.state.accountsAndAliases}
          />
        </Flexbox>
      </div>
    );
  }

  render() {
    return (
      <div className="preferences-signatures-container">
        <section>{this._renderSignatures()}</section>
      </div>
    );
  }
}
