import React from 'react';
import Switch from '../../../../src/components/switch';
import { localized } from 'mailspring-exports';
import { EventPropertyRow } from './event-property-row';

interface AllDayToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const AllDayToggle: React.FC<AllDayToggleProps> = ({ checked, onChange }) => {
  return (
    <EventPropertyRow label={localized('all-day:')}>
      <Switch checked={checked} onChange={() => onChange(!checked)} />
    </EventPropertyRow>
  );
};
