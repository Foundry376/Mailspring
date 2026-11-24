import { readableSystemAccent } from '../src/theme-manager';

const contrastWithWhite = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
};

// macOS accent colors as Electron's systemPreferences.getAccentColor() reports them.
describe('readableSystemAccent', () => {
  it('keeps accents that white text already reads on', () => {
    for (const accent of ['#007aff', '#0a84ff', '#953d96', '#f74f9e', '#e0383e', '#8c8c8c']) {
      expect(readableSystemAccent(accent)).toBe(accent);
    }
  });

  it('darkens yellow, orange, green and light graphite just enough for white text', () => {
    for (const accent of ['#ffc600', '#fcb827', '#f7821b', '#62ba46', '#989898']) {
      const shade = readableSystemAccent(accent);
      expect(shade).not.toBe(accent);
      expect(contrastWithWhite(shade)).not.toBeLessThan(3);
      expect(contrastWithWhite(shade)).toBeLessThan(3.1);
    }
    expect(readableSystemAccent('#ffc600')).toBe('#b88f00');
  });

  it('gives white text 3:1 on every color', () => {
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          expect(contrastWithWhite(readableSystemAccent(hex))).not.toBeLessThan(3);
        }
      }
    }
  });

  it('reads hex digits in either case, and leaves a value it cannot read alone', () => {
    expect(readableSystemAccent('#FFC600')).toBe('#b88f00');
    expect(readableSystemAccent('#fc0')).toBe('#fc0');
    expect(readableSystemAccent('')).toBe('');
  });
});

describe('ThemeManager.applySystemAccent', () => {
  const themes = () => AppEnv.themes as any;
  const rootProperty = (name: string) =>
    window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let originalAccent: string | null;

  beforeEach(() => {
    originalAccent = themes()._systemAccentColor;
  });

  afterEach(() => {
    themes()._systemAccentColor = originalAccent;
    themes().applySystemAccent();
  });

  it('sets the readable shade of the accent, and updates it when the accent changes', () => {
    themes()._systemAccentColor = '#ffc600';
    themes().applySystemAccent();
    expect(rootProperty('--system-accent')).toBe('#b88f00');

    themes()._systemAccentColor = '#007aff';
    themes().applySystemAccent();
    expect(rootProperty('--system-accent')).toBe('#007aff');
  });
});
