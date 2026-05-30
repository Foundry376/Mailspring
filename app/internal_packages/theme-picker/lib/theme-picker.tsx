import React from 'react';

import { Flexbox, ScrollRegion } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';
import {
  AUTOMATIC_THEME_NAME,
  LIGHT_THEME_NAME,
  DARK_THEME_NAME,
} from '../../../src/theme-manager';
import ThemeOption, { toSelector } from './theme-option';
import { Disposable } from 'event-kit';

// Sort order for built-in themes; community themes not in this list sort last.
const INTERNAL_THEME_ORDER = [
  'ui-less-is-more',
  'ui-ubuntu',
  'ui-taiga',
  'ui-darkside',
  DARK_THEME_NAME,
  LIGHT_THEME_NAME,
  AUTOMATIC_THEME_NAME,
];

function sortThemes<T extends { name: string }>(themes: T[]): T[] {
  return [...themes].sort(
    (a, b) => (INTERNAL_THEME_ORDER.indexOf(a.name) - INTERNAL_THEME_ORDER.indexOf(b.name)) * -1
  );
}

class ThemePicker extends React.Component<
  Record<string, unknown>,
  { themes: any[]; activeTheme: string; lightTheme: string; darkTheme: string }
> {
  static displayName = 'ThemePicker';

  themes = AppEnv.themes;
  disposable?: Disposable;

  constructor(props) {
    super(props);
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
      activeTheme: this.themes.getActiveThemeSetting().name,
      lightTheme: this.themes.getConfiguredLightThemeName(),
      darkTheme: this.themes.getConfiguredDarkThemeName(),
    };
  }

  _setActiveTheme(theme: string) {
    const prevActiveTheme = this.state.activeTheme;
    this.themes.setActiveTheme(theme);
    this._rewriteIFrame(prevActiveTheme, theme);
  }

  _setLightTheme(themeName: string) {
    this.themes.setLightTheme(themeName);
    this.setState({ lightTheme: themeName });
  }

  _setDarkTheme(themeName: string) {
    this.themes.setDarkTheme(themeName);
    this.setState({ darkTheme: themeName });
  }

  _rewriteIFrame(prevActiveTheme: string, activeTheme: string) {
    const activeFrame = document.querySelector(`.${toSelector(activeTheme)}`) as HTMLIFrameElement;
    const prevActiveFrame = document.querySelector(
      `.${toSelector(prevActiveTheme)}`
    ) as HTMLIFrameElement;

    if (prevActiveFrame) {
      const prevActiveDoc = prevActiveFrame.contentDocument;
      const prevActiveElement = prevActiveDoc.querySelector('.theme-option.active-true');
      if (prevActiveElement) prevActiveElement.className = 'theme-option active-false';
    }

    if (activeFrame) {
      const activeDoc = activeFrame.contentDocument;
      const activeElement = activeDoc.querySelector('.theme-option.active-false');
      if (activeElement) activeElement.className = 'theme-option active-true';
    }
  }

  _renderThemeOptions() {
    return sortThemes(this.state.themes).map((theme) => (
      <ThemeOption
        key={theme.name}
        theme={theme}
        active={this.state.activeTheme === theme.name}
        onSelect={() => this._setActiveTheme(theme.name)}
      />
    ));
  }

  _renderAutoSlots() {
    if (this.state.activeTheme !== AUTOMATIC_THEME_NAME) return null;

    const sorted = sortThemes(this.state.themes.filter((t) => t.name !== AUTOMATIC_THEME_NAME));

    return (
      <div className="auto-theme-selectors">
        <div className="auto-theme-selector">
          <label>
            <span className="auto-theme-icon">☀</span>
            {localized('When light')}
          </label>
          <select
            value={this.state.lightTheme}
            onChange={(e) => this._setLightTheme(e.target.value)}
          >
            {sorted.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="auto-theme-selector">
          <label>
            <span className="auto-theme-icon">☾</span>
            {localized('When dark')}
          </label>
          <select value={this.state.darkTheme} onChange={(e) => this._setDarkTheme(e.target.value)}>
            {sorted.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="theme-picker">
        <Flexbox direction="column">
          <h4 style={{ color: '#434648' }}>{localized('Themes')}</h4>
          <div style={{ color: 'rgba(35, 31, 32, 0.5)', fontSize: '12px' }}>
            {localized('Click any theme to apply:')}
          </div>
          <ScrollRegion style={{ margin: '10px 5px 0 5px', height: '300px' }}>
            {this._renderAutoSlots()}
            <Flexbox
              direction="row"
              height="auto"
              style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
            >
              {this._renderThemeOptions()}
            </Flexbox>
          </ScrollRegion>
          <div className="create-theme">
            <a
              href="https://github.com/Foundry376/Mailspring-Theme-Starter"
              style={{ color: '#3187e1' }}
            >
              {localized('Create a Theme')}
            </a>
          </div>
        </Flexbox>
      </div>
    );
  }
}

export default ThemePicker;
