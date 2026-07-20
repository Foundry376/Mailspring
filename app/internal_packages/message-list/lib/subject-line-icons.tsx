import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

const EMAIL_RENDER_MODE_KEY = 'core.reading.emailRenderMode';

interface SubjectLineIconsProps {
  canCollapse: boolean;
  hasCollapsedItems: boolean;

  onPrint: () => void;
  onPopIn: () => void;
  onPopOut: () => void;
  onToggleAllExpanded: () => void;
}

class EmailRenderModeToggle extends React.Component<Record<string, never>, { mode: string }> {
  _configDisposable?: { dispose: () => void };

  constructor(props: Record<string, never>) {
    super(props);
    this.state = { mode: this._mode() };
  }

  componentDidMount() {
    this._configDisposable = AppEnv.config.onDidChange(EMAIL_RENDER_MODE_KEY, () => {
      this.setState({ mode: this._mode() });
    });
  }

  componentWillUnmount() {
    if (this._configDisposable) {
      this._configDisposable.dispose();
    }
  }

  _mode = () => AppEnv.config.get(EMAIL_RENDER_MODE_KEY) || 'theme';

  _isDark = () => {
    const mode = this.state.mode;
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return document.body.classList.contains('theme-ui-dark');
  };

  _onToggle = () => {
    const nextMode = this._isDark() ? 'light' : 'dark';
    AppEnv.config.set(EMAIL_RENDER_MODE_KEY, nextMode);
  };

  render() {
    const isDark = this._isDark();
    const title = isDark
      ? localized('Switch email view to light mode')
      : localized('Switch email view to dark mode');
    const imageName = isDark ? 'toolbar-bulb-on.png' : 'toolbar-bulb-off.png';

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        title={title}
        onClick={this._onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._onToggle();
          }
        }}
      >
        <RetinaImg
          name={imageName}
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 16, height: 16 }}
          aria-hidden="true"
        />
      </div>
    );
  }
}

export const SubjectLineIcons: React.FunctionComponent<SubjectLineIconsProps> = (props) => (
  <div className="message-icons-wrap">
    {props.canCollapse && (
      <div
        role="button"
        tabIndex={0}
        aria-label={props.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
        title={props.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
        onClick={props.onToggleAllExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onToggleAllExpanded();
          }
        }}
      >
        <RetinaImg
          name={props.hasCollapsedItems ? 'expand.png' : 'collapse.png'}
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </div>
    )}
    <div
      role="button"
      tabIndex={0}
      aria-label={localized('Print Thread')}
      title={localized('Print Thread')}
      onClick={props.onPrint}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPrint();
        }
      }}
    >
      <RetinaImg name="print.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
    </div>
    <EmailRenderModeToggle />
    {AppEnv.isThreadWindow() ? (
      <div
        role="button"
        tabIndex={0}
        aria-label={localized('Pop thread in')}
        title={localized('Pop thread in')}
        onClick={props.onPopIn}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onPopIn();
          }
        }}
      >
        <RetinaImg name="thread-popin.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
      </div>
    ) : (
      <div
        role="button"
        tabIndex={0}
        aria-label={localized('Popout thread')}
        title={localized('Popout thread')}
        onClick={props.onPopOut}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onPopOut();
          }
        }}
      >
        <RetinaImg
          name="thread-popout.png"
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </div>
    )}
  </div>
);
