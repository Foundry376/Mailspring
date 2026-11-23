import fs from 'fs';

export type UserKeymap = { [command: string]: string | string[] };

/** The user's keymap.json, or an empty keymap when it is missing or unreadable. */
export function readUserKeymap(keymapPath: string): UserKeymap {
  try {
    return JSON.parse(fs.readFileSync(keymapPath).toString());
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(err);
    }
    return {};
  }
}

export function writeUserKeymap(keymapPath: string, keymap: UserKeymap) {
  fs.writeFileSync(keymapPath, JSON.stringify(keymap, null, 2));
}

/**
 * The binding recorded from these keys, in keymap syntax: modifiers join the key with "+",
 * plain keys pressed in turn are a sequence joined with " ". The platform's command key is
 * written as "mod", which the keymap reads as Cmd on macOS and Ctrl elsewhere.
 */
export function bindingFromKeys(keys: string[], modifiers: string[], platform: string): string {
  if (modifiers.length === 0) {
    return keys.join(' ');
  }
  const binding = [...modifiers, ...keys].join('+');
  return platform === 'darwin' ? binding.replace(/meta/g, 'mod') : binding.replace(/ctrl/g, 'mod');
}

/** The command's keys with `binding` added after them, unless it is already one of them. */
export function withBinding(bindings: string[], binding: string): string[] {
  return bindings.includes(binding) ? bindings : [...bindings, binding];
}
