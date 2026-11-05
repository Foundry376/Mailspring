import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SoundRegistry } from 'mailspring-exports';
import NotificationsSection from '../lib/tabs/notifications-section';
import {
  CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY,
  NOTIFICATION_SOUND_VOLUME_CONFIG_KEY,
} from '../../custom-sounds/lib/notification-sound';

describe('NotificationsSection', () => {
  afterEach(cleanup);

  const configSchema = {
    type: 'object',
    properties: {
      sounds: { type: 'boolean', title: 'Play sound' },
      soundVolume: {
        type: 'number',
        title: 'Volume',
        minimum: 0,
        maximum: 100,
        multipleOf: 1,
        unit: '%',
      },
      customSoundPath: { type: 'string', advanced: true },
    },
  } as any;

  it('selects and resets a supported custom sound', () => {
    let customPath = '';
    const config = {
      get: jasmine.createSpy('get').andCallFake((key) => {
        if (key === CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY) return customPath;
        if (key === NOTIFICATION_SOUND_VOLUME_CONFIG_KEY) return 100;
        if (key === 'core.notifications.sounds') return true;
        return undefined;
      }),
      set: jasmine.createSpy('set').andCallFake((key, value) => {
        if (key === CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY) customPath = value;
      }),
      toggle: jasmine.createSpy('toggle'),
    };
    spyOn(AppEnv, 'showOpenDialog').andCallFake((options, callback) => {
      callback(['/sounds/mail.ogg']);
    });
    const { getByText } = render(
      <NotificationsSection config={config} configSchema={configSchema} />
    );

    fireEvent.click(getByText('Choose Sound…'));
    expect(config.set).toHaveBeenCalledWith(
      CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY,
      '/sounds/mail.ogg'
    );

    const resetView = render(<NotificationsSection config={config} configSchema={configSchema} />);
    fireEvent.click(resetView.getByText('Reset to Default'));
    expect(config.set).toHaveBeenCalledWith(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY, '');
  });

  it('previews the notification sound with the configured volume', () => {
    const config = {
      get: jasmine.createSpy('get').andCallFake((key) => {
        if (key === NOTIFICATION_SOUND_VOLUME_CONFIG_KEY) return 40;
        if (key === CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY) return '';
        if (key === 'core.notifications.sounds') return true;
        return undefined;
      }),
      set: jasmine.createSpy('set'),
      toggle: jasmine.createSpy('toggle'),
    };
    spyOn(SoundRegistry, 'playSound');
    const { getByText } = render(
      <NotificationsSection config={config} configSchema={configSchema} />
    );

    fireEvent.click(getByText('Play Test Sound'));
    expect(SoundRegistry.playSound).toHaveBeenCalledWith('new-mail', { volume: 0.4 });
  });
});
