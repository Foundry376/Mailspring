import { localized } from 'mailspring-exports';

export type RepeatOption = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: 'none', label: localized('None') },
  { value: 'daily', label: localized('Every Day') },
  { value: 'weekly', label: localized('Every Week') },
  { value: 'monthly', label: localized('Every Month') },
  { value: 'yearly', label: localized('Every Year') },
];

export function repeatLabel(option: RepeatOption): string {
  return REPEAT_OPTIONS.find((opt) => opt.value === option).label;
}

/**
 * Convert an ICS recurrence frequency string to a RepeatOption UI value.
 */
export function frequencyToRepeatOption(frequency: string | undefined): RepeatOption {
  switch (frequency?.toUpperCase()) {
    case 'DAILY':
      return 'daily';
    case 'WEEKLY':
      return 'weekly';
    case 'MONTHLY':
      return 'monthly';
    case 'YEARLY':
      return 'yearly';
    default:
      return 'none';
  }
}

/**
 * Convert a RepeatOption UI value to an RRULE string (or null for 'none').
 */
export function repeatOptionToRRule(option: RepeatOption): string | null {
  switch (option) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly':
      return 'FREQ=WEEKLY';
    case 'monthly':
      return 'FREQ=MONTHLY';
    case 'yearly':
      return 'FREQ=YEARLY';
    default:
      return null;
  }
}
