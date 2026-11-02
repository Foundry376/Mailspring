import { isDarkColor } from '../src/theme-manager';

describe('isDarkColor', () => {
  it('classifies computed colors by luma around 50% gray', () => {
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(false);
    expect(isDarkColor('rgb(33, 33, 33)')).toBe(true);
    expect(isDarkColor('rgb(0, 0, 255)')).toBe(true);
    expect(isDarkColor('rgba(240, 240, 240, 1)')).toBe(false);
  });

  it('treats colors it cannot measure as light', () => {
    expect(isDarkColor('rgba(0, 0, 0, 0)')).toBe(false);
    expect(isDarkColor('color(srgb 0.96 0.98 0.99)')).toBe(false);
  });
});

describe('ThemeManager.isActiveThemeDark', () => {
  it("reads the light base theme's background as light", () => {
    expect(AppEnv.themes.isActiveThemeDark()).toBe(false);
  });
});
