import React from 'react';
import { localized, MailspringAPIRequest } from 'mailspring-exports';
import { CopyButton, RetinaImg } from 'mailspring-component-kit';

function buildShareHTML(htmlEl: HTMLElement, styleEl: HTMLStyleElement) {
  // The serialized stylesheet carries the active theme's colours, so the page
  // background must match or a dark theme exports as dark cards on white.
  const { backgroundColor, color } = window.getComputedStyle(document.body);
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8"> 
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="author" content="Mailspring">
    <title>Mailspring Activity</title>
    <style type="text/css">
    body {
      font-family: sans-serif;
      font-size: 14px;
      margin: 40px auto;
      max-width: 1000px;
      background: ${backgroundColor};
      color: ${color};
    }
    .hidden-on-web {
      display: none !important;
    }
    </style>
    ${styleEl.outerHTML}
    </head>
    <body>
    ${htmlEl.outerHTML}
    <script>
      Array.from(document.querySelectorAll('.visible')).forEach((el) => {
        el.classList.remove('visible');
        setTimeout(() => {
          el.classList.add('visible');
        }, 250);
      });
    </script>
    </body>
    </html>
`;
}

export default class ShareButton extends React.Component<
  Record<string, unknown>,
  { link: string; loading: boolean }
> {
  _mounted = false;
  _linkEl: HTMLInputElement;

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      link: null,
    };
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _onShareReport = async () => {
    this.setState({
      loading: true,
    });

    const link = await MailspringAPIRequest.postStaticPage({
      key: `activity-${Date.now()}`,
      html: buildShareHTML(
        document.querySelector('.activity-dashboard'),
        document.querySelector('style[source-path*="activity/styles/index.less"]')
      ),
    });
    if (!this._mounted) {
      return;
    }
    this.setState(
      {
        loading: false,
        link: link,
      },
      () => {
        if (this._linkEl) {
          this._linkEl.setSelectionRange(0, this._linkEl.value.length);
          this._linkEl.focus();
        }
      }
    );
  };

  render() {
    const { link, loading } = this.state;
    return (
      <>
        <div className="btn" onClick={this._onShareReport}>
          {localized('Share this Report')}
          {loading && (
            <RetinaImg
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentDark}
              style={{ width: 14, height: 14, marginLeft: 10 }}
            />
          )}
        </div>
        {link && (
          <div className="share-link">
            <input ref={(el) => (this._linkEl = el)} type="url" value={link} readOnly />
            <CopyButton text={link} />
          </div>
        )}
      </>
    );
  }
}
