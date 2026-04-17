import { RetinaImg, RovingTabIndexToolbar } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';
import PropTypes from 'prop-types';
import React from 'react';
import { isWaylandSession } from '../../../../src/browser/is-wayland';
import SystemTrayIconStore from '../../../system-tray/lib/system-tray-icon-store';
import { ConfigLike } from '../types';
import ConfigSchemaItem from './config-schema-item';

class AppearanceScaleSlider extends React.Component<
  { id: string; config: ConfigLike },
  { value: string }
> {
  static displayName = 'AppearanceScaleSlider';

  static propTypes = {
    id: PropTypes.string,
    config: PropTypes.object.isRequired,
  };

  kp = `core.workspace.interfaceZoom`;

  constructor(props) {
    super(props);
    this.state = { value: props.config.get(this.kp) };
  }

  componentDidUpdate(prevProps: { id: string; config: ConfigLike }) {
    if (prevProps.config !== this.props.config) {
      this.setState({ value: this.props.config.get(this.kp) });
    }
  }

  render() {
    return (
      <div id={this.props.id} className="appearance-scale-slider">
        <div className="ruler">
          <div style={{ flex: 1.02 }}>
            <RetinaImg name="appearance-scale-small.png" mode={RetinaImg.Mode.ContentDark} />
          </div>
          <div className="midpoint" />
          <div style={{ flex: 2, textAlign: 'right' }}>
            <RetinaImg name="appearance-scale-big.png" mode={RetinaImg.Mode.ContentDark} />
          </div>
        </div>
        <label htmlFor="interface-zoom-slider" className="sr-only">
          {localized('Interface Scale')}
        </label>
        <input
          id="interface-zoom-slider"
          type="range"
          min={0.8}
          max={1.4}
          step={0.05}
          value={this.state.value}
          aria-label={localized('Interface Scale')}
          onChange={e => this.props.config.set(this.kp, e.target.value)}
        />
      </div>
    );
  }
}

class MenubarStylePicker extends React.Component<{ config: ConfigLike }> {
  kp = 'core.workspace.menubarStyle';

  onChangeMenubarStyle = e => {
    this.props.config.set(this.kp, e.target.value);
  };

  render() {
    if (process.platform !== 'linux') return null;

    const val = this.props.config.get(this.kp);

    const waylandNote = isWaylandSession()
      ? localized(
          '(Native menu bar may not appear on Wayland. A menu button will be shown as a fallback.)'
        )
      : '';

    const options = [
      ['default', localized('Default Window Controls and Menubar'), waylandNote],
      [
        'autohide',
        localized('Default Window Controls and Auto-hiding Menubar'),
        localized('(Requires supported window manager. Press `Alt` to show menu.)'),
      ],
      ['hamburger', localized('Custom Window Frame and Right-hand Menu'), ''],
    ];

    return (
      <section>
        <h6>{localized('Window Controls and Menus')}</h6>
        {options.map(([enumValue, description, comment], idx) => (
          <div key={enumValue} style={{ marginBottom: 10 }}>
            <label htmlFor={`radio${idx}`}>
              <input
                id={`radio${idx}`}
                type="radio"
                value={enumValue}
                name="menubarStyle"
                checked={val === enumValue}
                onChange={this.onChangeMenubarStyle}
              />
              {` ${description}`}
              {comment && (
                <div style={{ paddingLeft: 24, fontSize: '0.9em', opacity: 0.7 }}>{comment}</div>
              )}
            </label>
          </div>
        ))}
        <div className="platform-note" style={{ lineHeight: '23px' }}>
          <div
            className="btn btn-small"
            style={{ float: 'right' }}
            onClick={() => {
              console.log('laappearnceng section relaunch');
              require('@electron/remote').app.relaunch();
              require('@electron/remote').app.quit();
            }}
          >
            {localized('Relaunch')}
          </div>
          {localized('Relaunch to apply window changes.')}
        </div>
      </section>
    );
  }
}

class AppearanceModeSwitch extends React.Component<
  { id: string; config: ConfigLike },
  { value: string }
> {
  static displayName = 'AppearanceModeSwitch';

  static propTypes = {
    id: PropTypes.string,
    config: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      value: props.config.get('core.workspace.mode'),
    };
  }

  componentDidUpdate(prevProps: { id: string; config: ConfigLike }) {
    if (prevProps.config !== this.props.config) {
      this.setState({
        value: this.props.config.get('core.workspace.mode'),
      });
    }
  }

  _onApplyChanges = () => {
    // The command to be called contains an `off` as this denotes the current
    // state that is used to show the menu item in an (in)active state.
    AppEnv.commands.dispatch(`navigation:${this.state.value}-mode-off`);
  };

  _renderModeOptions() {
    return ['list', 'split', 'splitVertical'].map(mode => (
      <AppearanceModeOption
        mode={mode}
        key={mode}
        active={this.state.value === mode}
        onClick={() => this.setState({ value: mode })}
      />
    ));
  }

  render() {
    const hasChanges = this.state.value !== this.props.config.get('core.workspace.mode');
    let applyChangesClass = 'btn';
    if (!hasChanges) applyChangesClass += ' btn-disabled';

    return (
      <div id={this.props.id} className="appearance-mode-switch">
        <RovingTabIndexToolbar
          label={localized('Layout')}
          className="item"
          style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
        >
          {this._renderModeOptions()}
        </RovingTabIndexToolbar>
        <div className={applyChangesClass} onClick={this._onApplyChanges}>
          {localized('Apply Layout')}
        </div>
      </div>
    );
  }
}

class TrayIconStylePicker extends React.Component<{ config: ConfigLike }> {
  kp = 'core.workspace.trayIconStyle';

  onChangeTrayIconStyle = e => {
    this.props.config.set(this.kp, e.target.value);
  };

  render() {
    const systemTrayIconScore = new SystemTrayIconStore();
    const val = this.props.config.get(this.kp) || 'blue';

    const options = [
      [
        'blue',
        localized('Blue icon for new and unread messages'),
        localized('(The same blue tray icon is used whether you have new or old unread messages.)'),
        systemTrayIconScore.inboxFullUnreadIcon(),
      ],
      [
        'red',
        localized('Red icon for new and blue icon for unread messages'),
        localized(
          '(A red tray icon is displayed for new messages and a blue icon for older unread messages.)'
        ),
        systemTrayIconScore.inboxFullNewIcon(),
      ],
      [
        'none',
        localized('No unread status indication'),
        localized(
          '(The tray icon always shows the default appearance regardless of unread messages.)'
        ),
        systemTrayIconScore.inboxFullIcon(),
      ],
    ];

    return (
      <section>
        <h6>{localized('Tray icon for new messages')}</h6>
        {options.map(([enumValue, description, comment, icon], idx) => (
          <div key={enumValue} style={{ marginBottom: 10 }}>
            <label htmlFor={`tray-sympol-radio${idx}`}>
              <input
                id={`tray-sympol-radio${idx}`}
                type="radio"
                value={enumValue}
                name="trayIconStyle"
                checked={val === enumValue}
                onChange={this.onChangeTrayIconStyle}
              />
              <img src={icon} style={{ height: 16, width: 16 }} />
              {` ${description} `}
              {comment && (
                <div style={{ paddingLeft: 24, fontSize: '0.9em', opacity: 0.7 }}>{comment}</div>
              )}
            </label>
          </div>
        ))}
      </section>
    );
  }
}

class TrayIconThemePicker extends React.Component<{ config: ConfigLike }> {
  kp = 'core.workspace.traySystemTheme';

  onChangeTrayIconTheme = e => {
    this.props.config.set(this.kp, e.target.value);
  };

  render() {
    if (process.platform !== 'linux') return null;

    const val = this.props.config.get(this.kp) || 'automatic';

    const options = [
      [
        'automatic',
        localized('Automatic'),
        localized('(Detect from system theme. On GNOME/Unity, assumes a dark tray background.)'),
      ],
      [
        'light',
        localized('Light tray background'),
        localized('(Use dark icons for a light tray.)'),
      ],
      ['dark', localized('Dark tray background'), localized('(Use light icons for a dark tray.)')],
    ];

    return (
      <section>
        <h6>{localized('Tray icon theme')}</h6>
        {options.map(([enumValue, description, comment], idx) => (
          <div key={enumValue} style={{ marginBottom: 10 }}>
            <label htmlFor={`tray-theme-radio${idx}`}>
              <input
                id={`tray-theme-radio${idx}`}
                type="radio"
                value={enumValue}
                name="traySystemTheme"
                checked={val === enumValue}
                onChange={this.onChangeTrayIconTheme}
              />
              {` ${description} `}
              {comment && (
                <div style={{ paddingLeft: 24, fontSize: '0.9em', opacity: 0.7 }}>{comment}</div>
              )}
            </label>
          </div>
        ))}
      </section>
    );
  }
}

const AppearanceModeOption = function AppearanceModeOption(props) {
  let classname = 'appearance-mode';
  if (props.active) classname += ' active';

  const label = {
    list: localized('Single Panel'),
    split: localized('Two Panel'),
    splitVertical: localized('Two Panel Vertical'),
  }[props.mode];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onClick();
    }
  };

  return (
    <div
      className={classname}
      role="button"
      tabIndex={-1}
      aria-pressed={props.active}
      aria-label={label}
      onClick={props.onClick}
      onKeyDown={onKeyDown}
    >
      <RetinaImg name={`appearance-mode-${props.mode}.png`} mode={RetinaImg.Mode.ContentIsMask} />
      <div>{label}</div>
    </div>
  );
};
AppearanceModeOption.propTypes = {
  mode: PropTypes.string.isRequired,
  active: PropTypes.bool,
  onClick: PropTypes.func,
};

class PreferencesAppearance extends React.Component<{ config: ConfigLike; configSchema: any }> {
  static displayName = 'PreferencesAppearance';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };

  onPickTheme = () => {
    AppEnv.commands.dispatch('window:launch-theme-picker');
  };

  render() {
    return (
      <div className="container-appearance">
        <section>
          <h6>{localized('Layout')}</h6>
          <AppearanceModeSwitch id="change-layout" config={this.props.config} />
        </section>
        <section>
          <h6 style={{ marginTop: 10 }}>{localized('Theme and Style')}</h6>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button
              className="btn btn-large"
              style={{ flexShrink: 0 }}
              onClick={this.onPickTheme}
            >
              {localized('Change Theme...')}
            </button>
            <ConfigSchemaItem
              configSchema={
                this.props.configSchema.properties.appearance.properties.useSystemAccent
              }
              keyPath="core.appearance.useSystemAccent"
              config={this.props.config}
            />
          </div>
        </section>
        <MenubarStylePicker config={this.props.config} />
        <section>
          <h6>{localized('Scaling')}</h6>
          <AppearanceScaleSlider id="change-scale" config={this.props.config} />
          <div className="platform-note">
            {localized(
              'Scaling adjusts the entire UI, including icons, dividers, and text. Messages you send will still have the same font size. Decreasing scale significantly may make dividers and icons too small to click.'
            )}
          </div>
        </section>
        <TrayIconStylePicker config={this.props.config} />
        <TrayIconThemePicker config={this.props.config} />
      </div>
    );
  }
}

export default PreferencesAppearance;
