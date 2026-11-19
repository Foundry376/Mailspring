import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import ConfigSchemaItem from '../lib/tabs/config-schema-item';

describe('ConfigSchemaItem', () => {
  afterEach(cleanup);

  it('renders and persists a bounded numeric range value as a number', () => {
    const config = {
      get: jasmine.createSpy('get').andReturn(65),
      set: jasmine.createSpy('set'),
      toggle: jasmine.createSpy('toggle'),
    };
    const configSchema = {
      type: 'number',
      title: 'Notification sound volume',
      minimum: 0,
      maximum: 100,
      multipleOf: 1,
      unit: '%',
    } as any;

    const { container } = render(
      <ConfigSchemaItem
        keyPath="core.notifications.soundVolume"
        config={config}
        configSchema={configSchema}
      />
    );

    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range.min).toBe('0');
    expect(range.max).toBe('100');
    expect(range.value).toBe('65');
    expect(container.querySelector('output').textContent).toBe('65%');

    fireEvent.change(range, { target: { value: '40' } });
    expect(config.set).toHaveBeenCalledWith('core.notifications.soundVolume', 40);
  });
});
