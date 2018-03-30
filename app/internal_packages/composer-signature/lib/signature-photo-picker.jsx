import { React, PropTypes, MailspringAPIRequest } from 'mailspring-exports';
import { RetinaImg, DropZone } from 'mailspring-component-kit';

const MAX_IMAGE_RES = 250;

export default class SignaturePhotoPicker extends React.Component {
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

    const ext = { 'image/jpg': 'jpg', 'image/png': 'png' }[blob.type];
    const filename = `sig-${this.props.id}.${ext}`;
    let link = null;

    try {
      link = await MailspringAPIRequest.postStaticAsset({ filename, blob });
    } catch (err) {
      AppEnv.showErrorDialog(
        `Sorry, we couldn't save your signature image to Mailspring's servers. Please try again.\n\n(${err.toString()})`
      );
      return;
    } finally {
      if (!this._isMounted) return;
      this.setState({ isUploading: false });
    }

    this.props.onChange({ target: { value: `${link}?t=${Date.now()}`, id: 'photoURL' } });
  };

  render() {
    const { data, resolvedURL } = this.props;
    const { isDropping, isUploading } = this.state;

    let source = data.photoURL || '';
    if (!['gravatar', 'twitter', 'company', ''].includes(source)) {
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
              <option value="twitter">Twitter Profile Image</option>
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
