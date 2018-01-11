import { remote } from 'electron';
import {
  React,
  AccountStore,
  SignatureStore,
  Actions,
  FocusedPerspectiveStore,
  Utils,
} from 'mailspring-exports';
import { Flexbox, EditableList } from 'mailspring-component-kit';

import { ResolveSignatureData, RenderSignatureData, DataShape } from './constants';
import SignatureAccountDefaultPicker from './signature-account-default-picker';
import SignatureTemplatePicker from './signature-template-picker';
import SignaturePhotoPicker from './signature-photo-picker';
import Templates from './templates';

class SignatureEditor extends React.Component {
  _onBaseFieldChange = event => {
    const { id, value } = event.target;
    const sig = this.props.signature;
    Actions.upsertSignature(Object.assign({}, sig, { [id]: value }), sig.id);
  };

  _onDataFieldChange = event => {
    const { id, value } = event.target;
    const sig = this.props.signature;

    // If you have raw selected and are switching back to a template,
    // display a warning UNLESS the html is an unmodified template HTML
    if (id === 'templateName' && !sig.data.templateName && value) {
      const htmlMatchesATemplate = Templates.find(
        t => sig.body === RenderSignatureData(Object.assign({}, sig.data, { templateName: t.name }))
      );
      if (!htmlMatchesATemplate) {
        const idx = remote.dialog.showMessageBox({
          type: 'warning',
          buttons: ['Cancel', 'Continue'],
          message: 'Revert custom HTML?',
          detail:
            "Switching back to a signature template will overwrite the custom HTML you've entered.",
        });
        if (idx === 0) {
          return;
        }
      }
    }

    // apply change
    sig.data = Object.assign({}, sig.data, { [id]: value });

    // re-render
    if (sig.data.templateName) {
      const template = Templates.find(t => t.name === sig.data.templateName);
      if (template) {
        sig.body = RenderSignatureData(sig.data);
      }
    }

    Actions.upsertSignature(sig, sig.id);
  };

  render() {
    const { accountsAndAliases, defaults } = this.props;

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

        <div className="section preview">
          <div className="label">Preview</div>
          <div className="preview" dangerouslySetInnerHTML={{ __html: signature.body }} />
        </div>

        <div className="section">
          <SignatureTemplatePicker resolvedData={resolvedData} onChange={this._onDataFieldChange} />
        </div>

        {!resolvedData.templateName
          ? [
              <div key="header" className="section-header">
                Raw HTML Source
              </div>,
              <textarea
                id="body"
                key="textarea"
                className="section raw-html"
                spellCheck={false}
                onChange={this._onBaseFieldChange}
                value={signature.body || ''}
              />,
            ]
          : [
              <div key="header" className="section-header">
                Information
              </div>,
              <div key="section" className="section information">
                {DataShape.map(item => (
                  <div className="field" key={item.key}>
                    <label>{item.label}</label>
                    <input
                      type="text"
                      onChange={this._onDataFieldChange}
                      placeholder={item.placeholder}
                      id={item.key}
                      value={data[item.key] || ''}
                    />
                  </div>
                ))}
                <SignaturePhotoPicker
                  id={signature.id}
                  data={data}
                  resolvedURL={resolvedData.photoURL}
                  onChange={this._onDataFieldChange}
                />
              </div>,
            ]}
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
