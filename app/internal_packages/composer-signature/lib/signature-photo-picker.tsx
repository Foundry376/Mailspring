import React from 'react';
import { webUtils } from 'electron';
import { pathToFileURL } from 'url';
import { localized } from 'mailspring-exports';
import { RetinaImg, DropZone } from 'mailspring-component-kit';

const MAX_IMAGE_RES = 250;

export default class SignaturePhotoPicker extends React.Component<
  {
    id: string;
    data: any;
    resolvedURL: string;
    onChange: (e: { target: { value: string; id?: string } }) => void;
  },
  {
    isDropping?: boolean;
    isUploading?: boolean;
  }
> {
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

  _onChooseImage = (event: React.MouseEvent) => {
    AppEnv.showOpenDialog(
      {
        title: localized('Choose an image'),
        buttonLabel: localized('Choose'),
        properties: ['openFile'],
      },
      (paths) => {
        if (paths && paths.length > 0) {
          this._onChooseImageFilePath(paths[0]);
        }
      }
    );
  };

  _onChooseImageFilePath = (filepath: string) => {
    const exts = ['png', 'jpg', 'svg', 'tif', 'gif', 'jpeg'];
    const ext = exts.find((ext) => filepath.toLowerCase().endsWith(`.${ext}`));
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
    img.onerror = () => AppEnv.showErrorDialog(localized('Unable to read this image.'));
    img.onload = () => {
      let scale = Math.min(MAX_IMAGE_RES / img.width, MAX_IMAGE_RES / img.height, 1);
      const scaleDesired = scale;
      let source: any = img;

      let times = 0;
      // eslint-disable-next-line no-constant-condition
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
        source.toBlob((blob) => this._onChooseImageBlob(blob), 'image/png');
      } else {
        source.toBlob((blob) => this._onChooseImageBlob(blob), 'image/jpeg', 0.65);
      }
    };
    img.src = pathToFileURL(filepath).href;
  };

  _onChooseImageBlob = async (blob: Blob) => {
    this.setState({ isUploading: true });
    try {
      const value = await new Promise<string>((resolve, reject) => {
        if (!blob) {
          reject(new Error('Unable to encode image'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      if (this._isMounted) {
        this.props.onChange({ target: { value, id: 'photoURL' } });
      }
    } catch (err) {
      AppEnv.showErrorDialog(localized('Unable to read this image.'));
    } finally {
      if (this._isMounted) this.setState({ isUploading: false });
    }
  };

  render() {
    const { resolvedURL } = this.props;
    const { isDropping, isUploading } = this.state;

    const dropNote =
      resolvedURL && resolvedURL !== ''
        ? localized('Click to replace')
        : localized('Choose an image from your computer');

    const emptyPlaceholderURL =
      ' data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAMAAAAPdrEwAAAAWlBMVEUAAACZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmb09q6AAAAHXRSTlMA5joH1zxJ+yUtA6pxM5hkFrVPRkDvV7+3toqIfkj9t0gAAADfSURBVFjD7dXLbsMgEIXhAZOAMfie9Hre/zXrRqVS7cgbz6KJziexmcUvhJBGiIiIiIjoGZg9cgj2HE2n+bw2zdN5TsfTtWxVy6mPp62s5RfX9GLV0lGK3gFo9NKhqcrohIWp1B6kQ1tGwQNwMSul4wB0ZZaAy6jyIOWm3pZhHoOopT+xcL38UktHh29D1E9PHjfvt7+SNdMtflxlNHiLeunelLRpPYBOL33FX5egln7FyqCVDh5rnVL6Axu+1khnadyGaTXStVT3aKyCZE/32AT847W7Q4iIiIiI6PF9AVm2Jjrl81jZAAAAAElFTkSuQmCC';

    return (
      <div className="field photo-picker">
        <label htmlFor="photoURL">Picture</label>
        <div style={{ display: 'flex' }}>
          <div>
            <DropZone
              onClick={this._onChooseImage}
              onDragStateChange={({ isDropping }) => this.setState({ isDropping })}
              onDrop={(e) =>
                this._onChooseImageFilePath(webUtils.getPathForFile(e.dataTransfer.files[0]))
              }
              shouldAcceptDrop={(e) => (e as any).dataTransfer.types.includes('Files')}
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
            <button type="button" className="btn" id="photoURL" onClick={this._onChooseImage}>
              {localized('Choose an image')}
            </button>
            {resolvedURL && (
              <button
                type="button"
                className="btn"
                onClick={() => this.props.onChange({ target: { value: '', id: 'photoURL' } })}
              >
                {localized('Remove')}
              </button>
            )}
          </div>
        </div>
        <div className="drop-note">{dropNote}</div>
      </div>
    );
  }
}
