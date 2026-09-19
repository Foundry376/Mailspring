import NativeNotifications from '../../src/native-notifications';
import { SoundRegistry, normalizeSoundVolume } from '../../src/registries/sound-registry';

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

  describe('playSound', () => {
    let originalAudio;
    let audioInstances;

    beforeEach(() => {
      originalAudio = window.Audio;
      audioInstances = [];
      (window as any).Audio = function MockAudio() {
        const audio = {
          src: '',
          volume: 1,
          autoplay: false,
          play: jasmine.createSpy('play').andReturn(Promise.resolve()),
        };
        audioInstances.push(audio);
        return audio;
      };
      spyOn(AppEnv, 'inSpecMode').andReturn(false);
      spyOn(NativeNotifications, 'doNotDisturb').andReturn(Promise.resolve(false));
    });

    afterEach(() => {
      (window as any).Audio = originalAudio;
    });

    it('applies a per-play source and volume without changing the registered sound', async () => {
      const registry = new SoundRegistry();
      registry.register('new-mail', 'mailspring://custom-sounds/default.ogg');

      await registry.playSound('new-mail', { source: 'file:///sounds/custom.ogg', volume: 0.4 });
      await registry.playSound('new-mail');

      expect(audioInstances[0].src).toBe('file:///sounds/custom.ogg');
      expect(audioInstances[0].volume).toBe(0.4);
      expect(audioInstances[1].src).toBe('mailspring://custom-sounds/default.ogg');
      expect(audioInstances[1].volume).toBe(1);
    });

    it('falls back to the registered sound when a custom source cannot play', async () => {
      const registry = new SoundRegistry();
      registry.register('new-mail', 'mailspring://custom-sounds/default.ogg');
      let instance = 0;
      (window as any).Audio = function MockAudio() {
        const audio = {
          src: '',
          volume: 1,
          autoplay: false,
          play: jasmine
            .createSpy('play')
            .andReturn(instance++ === 0 ? Promise.reject(new Error('decode failed')) : Promise.resolve()),
        };
        audioInstances.push(audio);
        return audio;
      };

      await registry.playSound('new-mail', { source: 'file:///sounds/broken.ogg', volume: 0.2 });

      expect(audioInstances.length).toBe(2);
      expect(audioInstances[0].src).toBe('file:///sounds/broken.ogg');
      expect(audioInstances[1].src).toBe('mailspring://custom-sounds/default.ogg');
      expect(audioInstances[1].volume).toBe(0.2);
    });
  });
});
