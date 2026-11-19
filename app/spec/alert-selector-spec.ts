import { AccountStore } from 'mailspring-exports';
import {
  alertChoices,
  customAlertLabel,
  maxAlerts,
} from '../internal_packages/main-calendar/lib/core/alert-selector';

describe('customAlertLabel', function () {
  it('reads a reminder before a timed event in its largest whole unit', function () {
    expect(customAlertLabel('-PT20M', false)).toBe('20 minutes before');
    expect(customAlertLabel('-PT1H30M', false)).toBe('90 minutes before');
    expect(customAlertLabel('-PT3H', false)).toBe('3 hours before');
    expect(customAlertLabel('-P3D', false)).toBe('3 days before');
    expect(customAlertLabel('PT0S', false)).toBe('At time of event');
  });

  it('reads Custom on an all-day event, where a relative reminder counts from midnight', function () {
    // Google's "9 AM the day before".
    expect(customAlertLabel('-PT15H', true)).toBe('Custom');
  });

  it('reads Custom for a reminder after the start or at a set time', function () {
    expect(customAlertLabel('PT5M', false)).toBe('Custom');
    expect(customAlertLabel('2026-11-16T09:00:00Z', false)).toBe('Custom');
  });
});

describe('alertChoices', function () {
  it('offers each unit a typed number can mean, up to four weeks before', function () {
    expect(alertChoices('20')).toEqual(['-PT20M', '-PT20H', '-P20D']);
    expect(alertChoices('3')).toEqual(['-PT3M', '-PT3H', '-P3D', '-P3W']);
    expect(alertChoices('5 w')).toEqual([]);
  });

  it('spells a choice as a stored reminder reads back, so picking the same one changes nothing', function () {
    expect(alertChoices('60 min')).toEqual(['-PT1H']);
  });
});

describe('maxAlerts', function () {
  it('allows one alert on an Outlook calendar, which Graph holds one of, and five elsewhere', function () {
    const account = spyOn(AccountStore, 'accountForId');
    account.andReturn({ provider: 'office365' });
    expect(maxAlerts('a')).toBe(1);
    account.andReturn({ provider: 'outlook' });
    expect(maxAlerts('a')).toBe(1);
    account.andReturn({ provider: 'gmail' });
    expect(maxAlerts('a')).toBe(5);
  });
});
