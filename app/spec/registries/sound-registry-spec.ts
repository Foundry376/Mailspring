import { normalizeSoundVolume } from '../../src/registries/sound-registry';

describe('SoundRegistry', () => {
  describe('normalizeSoundVolume', () => {
    it('uses full volume when no valid volume is provided', () => {
      expect(normalizeSoundVolume(undefined)).toBe(1);
      expect(normalizeSoundVolume(null)).toBe(0);
      expect(normalizeSoundVolume('not-a-number')).toBe(1);
      expect(normalizeSoundVolume(Number.NaN)).toBe(1);
    });

    it('accepts numeric values and numeric strings', () => {
      expect(normalizeSoundVolume(0)).toBe(0);
      expect(normalizeSoundVolume(0.5)).toBe(0.5);
      expect(normalizeSoundVolume(1)).toBe(1);
      expect(normalizeSoundVolume('0.35')).toBe(0.35);
    });

    it('clamps values to the HTML audio volume range', () => {
      expect(normalizeSoundVolume(-1)).toBe(0);
      expect(normalizeSoundVolume(2)).toBe(1);
      expect(normalizeSoundVolume(Number.NEGATIVE_INFINITY)).toBe(1);
      expect(normalizeSoundVolume(Number.POSITIVE_INFINITY)).toBe(1);
    });
  });
});
