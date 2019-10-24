import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg, Flexbox } from 'mailspring-component-kit';
import ThemeOption from './theme-option';

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

class AppearanceModeSwitch extends React.Component {
  static displayName = 'AppearanceModeSwitch';
  static propTypes = {
    modeSwitch: PropTypes.array.isRequired,
    config: PropTypes.object.isRequired,
    keyPath: PropTypes.string.isRequired,
    onSwitchOption: PropTypes.function,
  };

  constructor(props) {
    super();
    this.state = {
      value: props.config.get(props.keyPath),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    this.setState({
      value: nextProps.config.get(nextProps.keyPath),
    });
  }

  _onClick(modeInfo) {
    this.setState({ value: modeInfo.value }, () => this.props.onSwitchOption(modeInfo.value));
  }

  render() {
    const { modeSwitch } = this.props;
    const { value } = this.state;

    return (
      <div className="appearance-mode-switch">
        <Flexbox direction="row" style={{ alignItems: 'center' }} className="item">
          {modeSwitch.map(modeInfo => {
            const active = value === modeInfo.value;
            const classname = `appearance-mode${active ? ' active' : ''}`;

            return (
              <div className={classname} onClick={() => this._onClick(modeInfo)}>
                <RetinaImg name={modeInfo.imgsrc} mode="" active={active} />
                <div>{modeInfo.label}</div>
              </div>
            );
          })}
        </Flexbox>
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
    // only show light and dark mode
    sortedThemes = sortedThemes.filter(item => internalThemes.includes(item.name));
    return sortedThemes.map(theme => (
      <ThemeOption
        key={theme.name}
        theme={theme}
        active={this.state.activeTheme === theme.name}
        onSelect={() => this._setActiveTheme(theme.name)}
      />
    ));
  }

  _setActiveTheme(theme) {
    this.themes.setActiveTheme(theme);
  }

  render() {
    return (
      <div className="container-appearance">
        <div className="config-group">
          <h6>LAYOUT</h6>
          <AppearanceModeSwitch
            modeSwitch={[
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
            ]}
            config={this.props.config}
            keyPath={'core.appearance.profile'}
            onSwitchOption={value => {
              AppEnv.config.set('core.appearance.profile', value);
            }}
          />
          <AppearanceModeSwitch
            modeSwitch={[
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
            ]}
            config={this.props.config}
            keyPath={'core.workspace.mode'}
            onSwitchOption={value => {
              AppEnv.commands.dispatch(`navigation:select-${value}-mode`);
            }}
          />
        </div>

        <div className="config-group">
          <h6>Theme</h6>
          <Flexbox
            direction="row"
            style={{ alignItems: 'center' }}
            className="item appearance-mode-switch"
          >
            {this._renderThemeOptions()}
          </Flexbox>
        </div>
        <div className="config-group">
          <h6 htmlFor="change-scale">Scaling</h6>
          <AppearanceScaleSlider id="change-scale" config={this.props.config} />
        </div>
      </div>
    );
  }
}

export default PreferencesAppearance;
