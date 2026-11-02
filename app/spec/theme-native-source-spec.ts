import { ipcRenderer } from 'electron';
import { isDarkColor } from '../src/theme-manager';

describe('isDarkColor', () => {
  it('classifies computed colors by luma around 50% gray', () => {
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(false);
    expect(isDarkColor('rgb(33, 33, 33)')).toBe(true);
    expect(isDarkColor('rgb(0, 0, 255)')).toBe(true);
    expect(isDarkColor('rgba(240, 240, 240, 1)')).toBe(false);
  });
});

describe('ThemeManager.syncNativeThemeSource', () => {
  let themes;
  beforeEach(() => {
    themes = AppEnv.themes as any;
    spyOn(ipcRenderer, 'send');
  });

  const sentSource = () => {
    const calls = (ipcRenderer.send as any).calls.filter(
      (c) => c.args[0] === 'set-native-theme-source'
    );
    return calls.length ? calls[calls.length - 1].args[1] : undefined;
  };

  it("leaves automatic mode on 'system' so the OS appearance stays observable", () => {
    spyOn(themes, 'isAutomaticModeSelected').andReturn(true);
    spyOn(themes, 'isActiveThemeDark').andReturn(true);
    themes.syncNativeThemeSource();
    expect(sentSource()).toBe('system');
  });

  it('pins a fixed theme to its background lightness', () => {
    spyOn(themes, 'isAutomaticModeSelected').andReturn(false);
    themes.syncNativeThemeSource();
    expect(sentSource()).toBe('light');

    spyOn(themes, 'isActiveThemeDark').andReturn(true);
    themes.syncNativeThemeSource();
    expect(sentSource()).toBe('dark');
  });

  it('sends nothing while onboarding forces the base theme', () => {
    themes.baseThemeOnly = true;
    themes.syncNativeThemeSource();
    themes.baseThemeOnly = false;
    expect(sentSource()).toBeUndefined();
  });
});
