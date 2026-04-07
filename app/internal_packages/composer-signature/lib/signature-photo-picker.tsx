import React from 'react';
import { webUtils } from 'electron';
import { localized, PropTypes } from 'mailspring-exports';
import { RetinaImg, DropZone } from 'mailspring-component-kit';

const MAX_IMAGE_RES = 250;

export default class SignaturePhotoPicker extends React.Component<
  {
    id: string;
    data: any;
    resolvedURL: string;
    onChange: (e: { target: { value: string; id?: string } }) => void;
    onBatchChange?: (updates: Record<string, string>) => void;
  },
  {
    isDropping?: boolean;
    isUploading?: boolean;
  }
> {
  static propTypes = {
    id: PropTypes.string,
    data: PropTypes.object,
    resolvedURL: PropTypes.string,
    onChange: PropTypes.func,
    onBatchChange: PropTypes.func,
  };

  _isMounted: boolean;

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
      {
        title: localized('Choose an image'),
        buttonLabel: localized('Choose'),
        properties: ['openFile'],
      },
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
        localized(
          'Sorry, the file you selected does not look like an image. Please choose a file with one of the following extensions: %@',
          exts.join(',')
        )
      );
      return;
    }

    const img = new Image();
    img.onload = () => {
      let scale = Math.min(MAX_IMAGE_RES / img.width, MAX_IMAGE_RES / img.height, 1);
      const scaleDesired = scale;
      let source: any = img;

      let times = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
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

      if (ext === 'png' || ext === 'gif' || ext === 'svg') {
        source.toBlob(
          blob => this._onChooseImageBlob(blob, source.width, source.height),
          'image/png'
        );
      } else {
        source.toBlob(
          blob => this._onChooseImageBlob(blob, source.width, source.height),
          'image/jpg',
          0.65
        );
      }
    };
    img.src = `file://${filepath}`;
  };

  _onChooseImageBlob = (blob: Blob, width: number, height: number) => {
    this.setState({ isUploading: true });

    const reader = new FileReader();
    reader.onload = () => {
      if (!this._isMounted) return;
      const dataUrl = reader.result as string;
      this.setState({ isUploading: false });

      const batch = {
        photoURL: dataUrl,
        photoMsw: String(Math.round(width)),
        photoMsh: String(Math.round(height)),
      };
      if (this.props.onBatchChange) {
        this.props.onBatchChange(batch);
      } else {
        this.props.onChange({ target: { value: dataUrl, id: 'photoURL' } });
        this.props.onChange({ target: { value: batch.photoMsw, id: 'photoMsw' } });
        this.props.onChange({ target: { value: batch.photoMsh, id: 'photoMsh' } });
      }
    };
    reader.onerror = () => {
      if (!this._isMounted) return;
      this.setState({ isUploading: false });
      AppEnv.showErrorDialog(localized('Could not read the image file.'));
    };
    reader.readAsDataURL(blob);
  };

  _clearEmbeddedPhoto = () => {
    const batch = { photoURL: '', photoMsw: '', photoMsh: '' };
    if (this.props.onBatchChange) {
      this.props.onBatchChange(batch);
    } else {
      this.props.onChange({ target: { value: '', id: 'photoURL' } });
      this.props.onChange({ target: { value: '', id: 'photoMsw' } });
      this.props.onChange({ target: { value: '', id: 'photoMsh' } });
    }
  };

  render() {
    const { data, resolvedURL } = this.props;
    const { isDropping, isUploading } = this.state;

    const raw = data.photoURL || '';
    let source = raw;
    if (!['gravatar', 'custom', ''].includes(raw)) {
      source = 'custom';
    }

    const hasEmbeddedImage = raw.startsWith('data:');
    const isCloudHostedUrl =
      resolvedURL &&
      (resolvedURL.includes('getmailspring.com') || resolvedURL.includes('getpostra.com'));

    const dropNote = hasEmbeddedImage
      ? localized('Click to replace')
      : localized('Click to choose an image');

    const emptyPlaceholderURL =
      ' data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAMAAAAPdrEwAAAAWlBMVEUAAACZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmb09q6AAAAHXRSTlMA5joH1zxJ+yUtA6pxM5hkFrVPRkDvV7+3toqIfkj9t0gAAADfSURBVFjD7dXLbsMgEIXhAZOAMfie9Hre/zXrRqVS7cgbz6KJziexmcUvhJBGiIiIiIjoGZg9cgj2HE2n+bw2zdN5TsfTtWxVy6mPp62s5RfX9GLV0lGK3gFo9NKhqcrohIWp1B6kQ1tGwQNwMSul4wB0ZZaAy6jyIOWm3pZhHoOopT+xcL38UktHh29D1E9PHjfvt7+SNdMtflxlNHiLeunelLRpPYBOL33FX5egln7FyqCVDh5rnVL6Axu+1khnadyGaTXStVT3aKyCZE/32AT847W7Q4iIiIiI6PF9AVm2Jjrl81jZAAAAAElFTkSuQmCC';

    const previewUrl = resolvedURL || (hasEmbeddedImage ? raw : '') || emptyPlaceholderURL;

    return (
      <div className="field photo-picker">
        <label htmlFor="photoURL">Picture</label>
        <div style={{ display: 'flex' }}>
          <div>
            <DropZone
              onClick={this._onChooseImage}
              onDragStateChange={({ isDropping }) => this.setState({ isDropping })}
              onDrop={e =>
                this._onChooseImageFilePath(webUtils.getPathForFile(e.dataTransfer.files[0]))
              }
              shouldAcceptDrop={e => (e as any).dataTransfer.types.includes('Files')}
              style={{
                backgroundImage: !isUploading && `url(${previewUrl})`,
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
              <option value="">{localized('None')}</option>
              <option value="gravatar">{localized('Gravatar Profile Photo')}</option>
              <option disabled>──────────</option>
              <option value="custom">{localized('Embedded image…')}</option>
            </select>
            {source === 'custom' &&
              (hasEmbeddedImage || isCloudHostedUrl ? (
                <a className="btn" onClick={this._clearEmbeddedPhoto}>
                  {localized('Remove')}
                </a>
              ) : (
                <span style={{ fontSize: '0.85em', display: 'block', opacity: 0.75 }}>
                  {localized('Use the image well on the left to embed a picture (no web URL).')}
                </span>
              ))}
          </div>
        </div>
        <div className="drop-note">{dropNote}</div>
      </div>
    );
  }
}
