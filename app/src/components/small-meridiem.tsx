import React from 'react';
import moment from 'moment-timezone';
import { Utils } from 'mailspring-exports';

/** Time text with its AM/PM a size smaller, so it doesn't crowd the digits. */
export default function withSmallMeridiem(text: string): React.ReactNode {
  const locale = moment.localeData();
  const words = [locale.meridiem(1, 0, false), locale.meridiem(13, 0, false)].filter(Boolean);
  if (!words.length) return text;
  const pattern = new RegExp(`(${words.map(Utils.escapeRegExp).join('|')})`);
  return text.split(pattern).map((part, i) =>
    i % 2 ? (
      <span key={i} className="meridiem">
        {part}
      </span>
    ) : (
      part
    )
  );
}
