import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';
import ModeSwitch from './mode-switch';

class AppearanceScaleSlider extends React.Component {
  static displayName = 'AppearanceScaleSlider';

  static propTypes = {
    id: PropTypes.string,
    config: PropTypes.object.isRequired,
  };

  constructor(props) {
    super();
    this.kp = `core.workspace.interfaceZoom`;
    this.state = { value: props.config.get(this.kp) };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
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

class PreferencesAppearance extends React.Component {
  static displayName = 'PreferencesAppearance';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.themes = AppEnv.themes;
    this.state = this._getState();
  }

  componentDidMount() {
    this.disposable = this.themes.onDidChangeActiveThemes(() => {
      this.setState(this._getState());
    });
  }

  componentWillUnmount() {
    this.disposable.dispose();
  }

  _getState() {
    return {
      themes: this.themes.getAvailableThemes(),
      activeTheme: this.themes.getActiveTheme().name,
    };
  }

  onPickTheme = () => {
    AppEnv.commands.dispatch('window:launch-theme-picker');
  };

  _renderThemeOptions() {
    const internalThemes = ['ui-dark', 'ui-light'];
    let sortedThemes = [].concat(this.state.themes);
    sortedThemes.sort((a, b) => {
      return (internalThemes.indexOf(a.name) - internalThemes.indexOf(b.name)) * -1;
    });
    const labelMap = {
      light: 'Light Mode',
      dark: 'Dark Mode',
    };
    // only show light and dark mode
    sortedThemes = sortedThemes.filter(item => internalThemes.includes(item.name));
    const modeSwitchList = sortedThemes.map(theme => {
      const mode = theme.name.replace('ui-', '');
      return {
        value: theme.name,
        label: labelMap[mode],
        imgsrc: `prefs-appearance-${mode}.png`,
      };
    });
    return (
      <ModeSwitch
        className="theme-switch"
        modeSwitch={modeSwitchList}
        config={this.props.config}
        activeValue={this.state.activeTheme}
        onSwitchOption={value => {
          this.themes.setActiveTheme(value);
        }}
      />
    );
  }

  _renderProfileOptions() {
    const activeValue = this.props.config.get('core.appearance.profile');
    const modeSwitchList = [
      {
        value: true,
        label: 'Profile Pictures',
        imgsrc: `profile-${'show'}.png`,
      },
      {
        value: false,
        label: 'No Profile Pictures',
        imgsrc: `profile-${'hide'}.png`,
      },
    ];
    return (
      <ModeSwitch
        className="profile-switch"
        modeSwitch={modeSwitchList}
        config={this.props.config}
        activeValue={activeValue}
        imgActive
        onSwitchOption={value => {
          AppEnv.config.set('core.appearance.profile', value);
        }}
      />
    );
  }

  _renderPanelOptions() {
    const activeValue = this.props.config.get('core.workspace.mode');
    const modeSwitchList = [
      {
        value: 'list',
        label: 'Single Panel',
        imgsrc: `appearance-mode-${'list'}.png`,
      },
      {
        value: 'split',
        label: 'Two Panels',
        imgsrc: `appearance-mode-${'split'}.png`,
      },
    ];
    return (
      <ModeSwitch
        modeSwitch={modeSwitchList}
        config={this.props.config}
        activeValue={activeValue}
        imgActive
        onSwitchOption={value => {
          AppEnv.commands.dispatch(`navigation:select-${value}-mode`);
        }}
      />
    );
  }

  render() {
    return (
      <div className="container-appearance">
        <div className="config-group">
          <h6>LAYOUT</h6>
          {this._renderProfileOptions()}
          {this._renderPanelOptions()}
        </div>

        <div className="config-group">
          <h6>THEME</h6>
          {this._renderThemeOptions()}
        </div>
        <div className="config-group">
          <h6 htmlFor="change-scale">SCALING</h6>
          <AppearanceScaleSlider id="change-scale" config={this.props.config} />
        </div>
      </div>
    );
  }
}

export default PreferencesAppearance;
