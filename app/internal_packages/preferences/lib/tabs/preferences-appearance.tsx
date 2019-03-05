import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg, Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';
import { ConfigLike } from '../types';

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

  componentWillReceiveProps(nextProps) {
    this.setState({ value: nextProps.config.get(this.kp) });
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
        <input
          type="range"
          min={0.8}
          max={1.4}
          step={0.05}
          value={this.state.value}
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
    const val = this.props.config.get(this.kp) || 'default';

    const options = [
      ['default', localized('Default Window Controls and Menubar'), ''],
      [
        'autohide',
        localized('Default Window Controls and Auto-hiding Menubar'),
        localized('(Requires supported window manager. Press `Alt` to show menu.)'),
      ],
      ['hamburger', localized('Custom Window Frame and Right-hand Menu'), ''],
    ];

    return (
      <section className="platform-linux-only">
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
              require('electron').remote.app.relaunch();
              require('electron').remote.app.quit();
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

  componentWillReceiveProps(nextProps) {
    this.setState({
      value: nextProps.config.get('core.workspace.mode'),
    });
  }

  _onApplyChanges = () => {
    AppEnv.commands.dispatch(`navigation:select-${this.state.value}-mode`);
  };

  _renderModeOptions() {
    return ['list', 'split'].map(mode => (
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
        <Flexbox direction="row" style={{ alignItems: 'center' }} className="item">
          {this._renderModeOptions()}
        </Flexbox>
        <div className={applyChangesClass} onClick={this._onApplyChanges}>
          {localized('Apply Layout')}
        </div>
      </div>
    );
  }
}

const AppearanceModeOption = function AppearanceModeOption(props) {
  let classname = 'appearance-mode';
  if (props.active) classname += ' active';

  const label = {
    list: localized('Single Panel'),
    split: localized('Two Panel'),
  }[props.mode];

  return (
    <div className={classname} onClick={props.onClick}>
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
          <div>
            <button className="btn btn-large" onClick={this.onPickTheme}>
              {localized('Change Theme...')}
            </button>
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
      </div>
    );
  }
}

export default PreferencesAppearance;
