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

/** The keys a binding stands for here: "mod" is Cmd on macOS and Ctrl elsewhere. */
export function pressedKeys(binding: string, platform: string): string {
  return binding.replace(/\bmod\b/g, platform === 'darwin' ? 'command' : 'ctrl');
}

/**
 * The command's keys without `binding`, and without any other spelling of the same keys: a
 * template may list mod+a beside ctrl+a, which are one key on Windows and Linux.
 */
export function withoutBinding(bindings: string[], binding: string, platform: string): string[] {
  const removed = pressedKeys(binding, platform);
  return bindings.filter((b) => pressedKeys(b, platform) !== removed);
}

/** The keymap with each of `commands` set to no keys, which unbinds it over the template. */
export function clearedKeymap(keymap: UserKeymap, commands: string[]): UserKeymap {
  const cleared = { ...keymap };
  for (const command of commands) {
    cleared[command] = [];
  }
  return cleared;
}

/** The command's keys that its default keys don't already include. */
export function addedBindings(bindings: string[], defaults: string[], platform: string): string[] {
  const defaultKeys = defaults.map((b) => pressedKeys(b, platform));
  return bindings.filter((b) => !defaultKeys.includes(pressedKeys(b, platform)));
}

/** For each command, which of its keys clash, and with which other commands. */
export type Conflicts = { [command: string]: { [binding: string]: string[] } };

/**
 * Keys the user added that another command also has. Every command bound to a key runs when it
 * is pressed, so both act. The defaults' own overlaps are left out: templates give one key to
 * commands that act in different places, like Outlook's Ctrl+U, which underlines in the composer
 * and marks unread in the mail list.
 */
export function findConflicts(
  bindings: { [command: string]: string[] },
  added: { [command: string]: string[] },
  platform: string
): Conflicts {
  const conflicts: Conflicts = {};
  const note = (command: string, binding: string, other: string) => {
    conflicts[command] = conflicts[command] || {};
    conflicts[command][binding] = conflicts[command][binding] || [];
    if (!conflicts[command][binding].includes(other)) {
      conflicts[command][binding].push(other);
    }
  };
  for (const command of Object.keys(added)) {
    for (const binding of added[command]) {
      const key = pressedKeys(binding, platform);
      for (const other of Object.keys(bindings)) {
        const clash =
          other !== command && bindings[other].find((b) => pressedKeys(b, platform) === key);
        if (clash) {
          note(command, binding, other);
          note(other, clash, command);
        }
      }
    }
  }
  return conflicts;
}
