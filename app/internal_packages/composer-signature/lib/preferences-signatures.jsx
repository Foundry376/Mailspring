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
import { ResolveSignatureData, RenderSignatureData, DataShape } from './constants';
import SignatureAccountDefaultPicker from './signature-account-default-picker';
import SignatureTemplatePicker from './signature-template-picker';
import SignaturePhotoPicker from './signature-photo-picker';
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
          <div style={{ flex: 1 }} />
          <SignatureAccountDefaultPicker
            signature={signature}
            accountsAndAliases={accountsAndAliases}
            defaults={defaults}
          />
        </div>

        <div className="section editor" onClick={this._onFocusEditor}>
          <ComposerEditor
            ref={c => (this._composer = c)}
            readOnly={false}
            value={editorState}
            propsForPlugins={{}}
            onChange={change => this.setState({ editorState: change.value })}
            onBlur={this._onSave}
            onFileReceived={() => {
              // This method ensures that HTML can be pasted.
            }}
          />
        </div>
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

    let data = {};
    let body = null;
    if (this.state.selectedSignature) {
      data = Object.assign({}, this.state.selectedSignature.data);
      body = this.state.selectedSignature.body;
    } else {
      data = {
        templateName: Templates[0].name,
        name: activeAccount.name,
        email: activeAccount.emailAddress,
      };
      body = RenderSignatureData(data);
    }

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

  _renderSignatures() {
    const sigArr = Object.values(this.state.signatures);

    return (
      <Flexbox>
        <EditableList
          showEditIcon
          className="signature-list"
          items={sigArr}
          itemContent={sig => sig.title}
          onCreateItem={this._onAddSignature}
          onDeleteItem={this._onDeleteSignature}
          onItemEdited={this._onEditSignatureTitle}
          onSelectItem={this._onSelectSignature}
          selected={this.state.selectedSignature}
        />
        <SignatureEditor
          signature={this.state.selectedSignature}
          defaults={this.state.defaults}
          accountsAndAliases={this.state.accountsAndAliases}
        />
      </Flexbox>
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
