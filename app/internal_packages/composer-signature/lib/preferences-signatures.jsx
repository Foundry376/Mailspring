import { remote } from 'electron';
import {
  React,
  PropTypes,
  AccountStore,
  SignatureStore,
  Actions,
  FocusedPerspectiveStore,
  MailspringAPIRequest,
  Utils,
} from 'mailspring-exports';
import {
  Flexbox,
  RetinaImg,
  EditableList,
  MultiselectDropdown,
  DropZone,
} from 'mailspring-component-kit';

import Templates from './templates';
import { ResolveSignatureData, RenderSignatureData, DataShape } from './constants';

const MAX_IMAGE_RES = 250;

class SignatureAccountDefaultPicker extends React.Component {
  static propTypes = {
    defaults: PropTypes.object,
    signature: PropTypes.object,
    accountsAndAliases: PropTypes.array,
  };

  _onToggleAccount = account => {
    Actions.toggleAccount(account.email);
  };

  render() {
    const { accountsAndAliases, defaults, signature } = this.props;

    const isChecked = accountOrAlias => defaults[accountOrAlias.email] === signature.id;
    const checked = accountsAndAliases.filter(isChecked);

    return (
      <div className="account-picker">
        Default for:{' '}
        <MultiselectDropdown
          className="account-dropdown"
          items={accountsAndAliases}
          itemChecked={isChecked}
          itemContent={accountOrAlias => accountOrAlias.email}
          itemKey={a => a.id}
          current={signature}
          attachment={'right'}
          buttonText={`${checked.length} Account${checked.length === 1 ? '' : 's'}`}
          onToggleItem={this._onToggleAccount}
        />
      </div>
    );
  }
}

class SignatureTemplatePicker extends React.Component {
  static propTypes = {
    resolvedData: PropTypes.object,
    onChange: PropTypes.func,
  };

  _onClickItem = event => {
    const value = event.currentTarget.dataset.value;
    this.props.onChange({ target: { id: 'templateName', value } });
  };

  componentDidMount() {
    this.ensureSelectionVisible();
  }

  componentDidUpdate() {
    this.ensureSelectionVisible();
  }

  ensureSelectionVisible() {
    const item = this._el.querySelector('.active');
    if (item) {
      const left = item.offsetLeft - 5;
      const right = item.offsetLeft + item.clientWidth + 5;

      if (left < this._el.scrollLeft) {
        this._el.scrollLeft = left;
      } else if (right > this._el.scrollLeft + this._el.clientWidth) {
        this._el.scrollLeft = right - this._el.clientWidth;
      }
    }
  }

  render() {
    const { resolvedData } = this.props;

    return (
      <div ref={el => (this._el = el)} className="signature-template-picker">
        {Templates.map((t, idx) => (
          <div
            key={idx}
            data-value={t.name}
            className={`option ${t.name === resolvedData.templateName && 'active'}`}
            onClick={this._onClickItem}
          >
            <div className="centered">
              <div className="preview">{t(this.props.resolvedData)}</div>
            </div>
          </div>
        ))}
        <div
          data-value={null}
          className={`option ${!resolvedData.templateName && 'active'}`}
          onClick={this._onClickItem}
        >
          <div className="centered">Raw HTML</div>
        </div>
      </div>
    );
  }
}

class SignaturePhotoPicker extends React.Component {
  static propTypes = {
    id: PropTypes.string,
    data: PropTypes.object,
    resolvedURL: PropTypes.string,
    onChange: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = {
      isUploading: false,
      isDropping: false,
    };
  }

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  _onChooseImage = event => {
    AppEnv.showOpenDialog(
      { title: 'Choose an image', buttonLabel: 'Choose', properties: ['openFile'] },
      paths => {
        if (paths && paths.length > 0) {
          this._onChooseImageFilePath(paths[0]);
        }
      }
    );
  };

  _onChooseImageFilePath = filepath => {
    const exts = ['png', 'jpg', 'svg', 'tif', 'gif', 'jpeg'];
    const ext = exts.find(ext => filepath.toLowerCase().endsWith(`.${ext}`));
    if (!ext) {
      AppEnv.showErrorDialog(
        `Sorry, the file you selected does not look like an image. Please choose a file with one of the following extensions: ${exts.join(
          ', '
        )}`
      );
      return;
    }

    // attach the image to the DOM and resize it to be no more than 300px x 300px,
    // then save it as a data URL
    const img = new Image();
    img.onload = () => {
      let scale = Math.min(MAX_IMAGE_RES / img.width, MAX_IMAGE_RES / img.height, 1);
      let scaleDesired = scale;
      let source = img;

      let times = 0;
      while (true) {
        // instead of scaling from 1 to 0.4, we'll scale in steps where each step is >= 50%.
        // Adding intermediate step improves visual quality a lot for logos, text, etc.
        // because Chrome is old-school and uses low quality bi-linear interpolation.
        //
        // The math here works because (0.4^0.5)^2 = 0.4
        times += 1;
        scale = Math.pow(scaleDesired, 1.0 / times);
        if (scale >= 0.6) {
          break;
        }
      }

      for (let x = 1; x <= times; x++) {
        const canvas = document.createElement('canvas');
        canvas.width = source.width * scale;
        canvas.height = source.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        source = canvas;
      }

      // png, gif, svg stay in PNG format, everything else gets converted to
      // a JPG with lossy compression
      if (ext === 'png' || ext === 'gif' || ext === 'svg') {
        source.toBlob(this._onChooseImageBlob, 'image/png');
      } else {
        source.toBlob(this._onChooseImageBlob, 'image/jpg', 0.65);
      }
    };
    img.src = `file://${filepath}`;
  };

  _onChooseImageBlob = async blob => {
    this.setState({ isUploading: true });

    const body = new FormData();
    const ext = { 'image/jpg': 'jpg', 'image/png': 'png' }[blob.type];
    body.set('filename', `sig-${this.props.id}.${ext}`);
    body.set('file', blob);

    let resp = null;
    try {
      resp = await MailspringAPIRequest.makeRequest({
        server: 'identity',
        method: 'POST',
        path: `/api/save-public-asset`,
        body: body,
      });
    } catch (err) {
      AppEnv.showErrorDialog(
        `Sorry, we couldn't save your signature image to Mailspring's servers. Please try again.\n\n(${err.toString()})`
      );
      return;
    } finally {
      if (!this._isMounted) return;
      this.setState({ isUploading: false });
    }

    this.props.onChange({ target: { value: `${resp.link}?t=${Date.now()}`, id: 'photoURL' } });
  };

  render() {
    const { data, resolvedURL } = this.props;
    const { isDropping, isUploading } = this.state;

    let source = data.photoURL || '';
    if (!['gravatar', 'company', ''].includes(source)) {
      source = 'custom';
    }

    // we don't display the <input> for data URLs because they can be
    // long and the UI becomes slow.
    const isMailspringURL = resolvedURL && resolvedURL.includes('getmailspring.com');
    const dropVerb = resolvedURL && resolvedURL !== '' ? 'replace' : 'upload';

    const emptyPlaceholderURL =
      ' data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAMAAAAPdrEwAAAAWlBMVEUAAACZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmb09q6AAAAHXRSTlMA5joH1zxJ+yUtA6pxM5hkFrVPRkDvV7+3toqIfkj9t0gAAADfSURBVFjD7dXLbsMgEIXhAZOAMfie9Hre/zXrRqVS7cgbz6KJziexmcUvhJBGiIiIiIjoGZg9cgj2HE2n+bw2zdN5TsfTtWxVy6mPp62s5RfX9GLV0lGK3gFo9NKhqcrohIWp1B6kQ1tGwQNwMSul4wB0ZZaAy6jyIOWm3pZhHoOopT+xcL38UktHh29D1E9PHjfvt7+SNdMtflxlNHiLeunelLRpPYBOL33FX5egln7FyqCVDh5rnVL6Axu+1khnadyGaTXStVT3aKyCZE/32AT847W7Q4iIiIiI6PF9AVm2Jjrl81jZAAAAAElFTkSuQmCC';

    return (
      <div className="field photo-picker">
        <label>Picture</label>
        <div style={{ display: 'flex' }}>
          <div>
            <DropZone
              onClick={this._onChooseImage}
              onDragStateChange={({ isDropping }) => this.setState({ isDropping })}
              onDrop={e => this._onChooseImageFilePath(e.dataTransfer.files[0].path)}
              shouldAcceptDrop={e => e.dataTransfer.types.includes('Files')}
              style={{
                backgroundImage: !isUploading && `url(${resolvedURL || emptyPlaceholderURL})`,
              }}
              className={`photo-well ${isDropping && 'dropping'}`}
            >
              {isUploading && (
                <RetinaImg
                  style={{ width: 14, height: 14 }}
                  name="inline-loading-spinner.gif"
                  mode={RetinaImg.Mode.ContentPreserve}
                />
              )}
            </DropZone>
          </div>
          <div className="photo-options">
            <select
              id="photoURL"
              tabIndex={-1}
              value={source || ''}
              onChange={this.props.onChange}
              style={{ display: 'block' }}
            >
              <option value="">None</option>
              <option value="gravatar">Gravatar Profile Photo</option>
              <option value="company">Company / Domain Logo</option>
              <option disabled>──────────</option>
              <option value="custom">Custom Image</option>
            </select>
            {source === 'custom' &&
              (isMailspringURL ? (
                <a
                  className="btn"
                  onClick={() => this.props.onChange({ target: { value: '', id: 'photoURL' } })}
                >
                  Remove
                </a>
              ) : (
                <input
                  type="url"
                  id="photoURL"
                  placeholder="http://"
                  value={data.photoURL === 'custom' ? '' : data.photoURL}
                  onChange={this.props.onChange}
                />
              ))}
          </div>
        </div>
        <div className="drop-note">{`Click to ${dropVerb}`}</div>
      </div>
    );
  }
}

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
