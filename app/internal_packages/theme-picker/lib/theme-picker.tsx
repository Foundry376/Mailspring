/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React from 'react';

import { Flexbox, ScrollRegion } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';
import ThemeOption, { toSelector } from './theme-option';
import { Disposable } from 'event-kit';

class ThemePicker extends React.Component<{}, { themes: any[]; activeTheme: string }> {
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
      activeTheme: this.themes.getActiveTheme().name,
    };
  }

  _setActiveTheme(theme) {
    const prevActiveTheme = this.state.activeTheme;
    this.themes.setActiveTheme(theme);
    this._rewriteIFrame(prevActiveTheme, theme);
  }

  _rewriteIFrame(prevActiveTheme, activeTheme) {
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
    const internalThemes = [
      'ui-less-is-more',
      'ui-ubuntu',
      'ui-taiga',
      'ui-darkside',
      'ui-dark',
      'ui-light',
    ];
    const sortedThemes = [...this.state.themes];
    sortedThemes.sort((a, b) => {
      return (internalThemes.indexOf(a.name) - internalThemes.indexOf(b.name)) * -1;
    });
    return sortedThemes.map(theme => (
      <ThemeOption
        key={theme.name}
        theme={theme}
        active={this.state.activeTheme === theme.name}
        onSelect={() => this._setActiveTheme(theme.name)}
      />
    ));
  }

  render() {
    return (
      <div className="theme-picker" tabIndex={1}>
        <Flexbox direction="column">
          <h4 style={{ color: '#434648' }}>{localized('Themes')}</h4>
          <div style={{ color: 'rgba(35, 31, 32, 0.5)', fontSize: '12px' }}>
            {localized('Click any theme to apply:')}
          </div>
          <ScrollRegion style={{ margin: '10px 5px 0 5px', height: '290px' }}>
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
