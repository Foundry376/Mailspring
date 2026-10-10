import React from 'react';
import { localized } from 'mailspring-exports';

/** A keystroke as the platform writes it: ⌘⇧D on macOS, Ctrl+Shift+D on Windows and Linux. */
export function formatKeystrokes(original: string): string {
  // macOS shows menu-bar glyphs (⌘⇧D); Windows and Linux spell shortcuts out
  // (Ctrl+Shift+D), and their users don't read ^ or ⌥ as modifier keys.
  const isMac = process.platform === 'darwin';
  const modifiers: [RegExp, string][] = isMac
    ? [
        [/\+(?!$)/gi, ''],
        [/command/gi, '⌘'],
        [/meta/gi, '⌘'],
        [/alt/gi, '⌥'],
        [/shift/gi, '⇧'],
        [/ctrl/gi, '^'],
        [/mod/gi, '⌘'],
      ]
    : [
        [/alt/gi, 'Alt'],
        [/shift/gi, 'Shift'],
        [/ctrl/gi, 'Ctrl'],
        [/mod/gi, 'Ctrl'],
      ];
  let clean = original;
  for (const [regexp, char] of modifiers) {
    clean = clean.replace(regexp, char);
  }

  if (isMac) {
    // ⌘⇧c => ⌘⇧C
    if (clean !== original) {
      clean = clean.toUpperCase();
    }
    // backspace => Backspace
    if (original.length > 1 && clean === original) {
      clean = clean[0].toUpperCase() + clean.slice(1);
    }
    return clean;
  }

  // ctrl+shift+d => Ctrl+Shift+D, alt+backspace => Alt+Backspace
  return clean
    .split('+')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join('+');
}

/** A binding for display; a sequence such as "g i" reads "G then I". */
export function renderKeystrokes(keystrokes: string, idx: number) {
  const elements = [];
  const splitKeystrokes = keystrokes.split(' ');
  splitKeystrokes.forEach((keystroke, kidx) => {
    elements.push(<span key={kidx}>{formatKeystrokes(keystroke)}</span>);
    if (kidx < splitKeystrokes.length - 1) {
      elements.push(
        <span className="then" key={`then${kidx}`}>
          {` ${localized('then')} `}
        </span>
      );
    }
  });
  return (
    <span key={`keystrokes-${idx}`} className="shortcut-value">
      {elements}
    </span>
  );
}
