import { isDarkColor } from '../src/theme-manager';

describe('isDarkColor', () => {
  it('classifies colors by the text color contrast-color() picks for them', () => {
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(false);
    expect(isDarkColor('rgb(33, 33, 33)')).toBe(true);
    expect(isDarkColor('rgb(0, 0, 255)')).toBe(true);
    expect(isDarkColor('color(srgb 0.96 0.98 0.99)')).toBe(false);
    expect(isDarkColor('oklch(0.3 0.05 250)')).toBe(true);
  });

  it('treats a transparent background as light', () => {
    expect(isDarkColor('rgba(0, 0, 0, 0)')).toBe(false);
  });
});

describe('ThemeManager.isActiveThemeDark', () => {
  it("reads the light base theme's background as light", () => {
    expect(AppEnv.themes.isActiveThemeDark()).toBe(false);
  });
});
