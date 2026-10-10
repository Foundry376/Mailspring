import { pressedKeys } from './user-keymap';

// Names people type for keys, as the keymap spells them.
const KEY_ALIASES: [RegExp, string][] = [
  [/\bcmd\b/g, 'command'],
  [/\bcontrol\b/g, 'ctrl'],
  [/\b(option|opt)\b/g, 'alt'],
];

/** Whether a command matches typed text: its name, or one of its keys as written ("ctrl+r"). */
export function matchesQuery(
  label: string,
  bindings: string[],
  query: string,
  platform: string
): boolean {
  const text = query.trim().toLowerCase();
  if (!text) {
    return true;
  }
  if (label.toLowerCase().includes(text)) {
    return true;
  }
  const keyText = KEY_ALIASES.reduce((t, [alias, name]) => t.replace(alias, name), text);
  return bindings.some((b) => pressedKeys(b, platform).toLowerCase().includes(keyText));
}

/** Whether pressing `key` runs this command. */
export function runsOnKey(bindings: string[], key: string, platform: string): boolean {
  const pressed = pressedKeys(key, platform);
  return bindings.some((b) => pressedKeys(b, platform) === pressed);
}
