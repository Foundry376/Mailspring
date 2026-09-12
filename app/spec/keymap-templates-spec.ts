import fs from 'fs';
import path from 'path';
import KeymapManager from '../src/keymap-manager';

// Templates replace the base bindings of every command they define, so each one
// must restate the base keystrokes it wants to keep. Any base keystroke a
// template drops must be listed here as deliberate.
const intentionallyDropped: { [template: string]: { [command: string]: string[] } } = {
  // Outlook maps ctrl+q to mark-as-read; command+q keeps quit on macOS and
  // alt+f4 covers Windows and Linux.
  Outlook: { 'application:quit': ['mod+q'] },
};

const normalize = (keystrokes: string) =>
  keystrokes.replace(/\bmod\b/g, process.platform === 'darwin' ? 'command' : 'ctrl');

describe('Keymap templates', function () {
  const resourcePath = AppEnv.getLoadSettings().resourcePath;
  const keymapsDir = path.join(resourcePath, 'keymaps');
  const templatesDir = path.join(keymapsDir, 'templates');
  const templates = fs
    .readdirSync(templatesDir)
    .filter((filename) => path.extname(filename) === '.json')
    .map((filename) => path.parse(filename).name);

  const bindingsWith = (template?: string) => {
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    manager.loadKeymap(path.join(keymapsDir, 'base.json'));
    manager.loadKeymap(path.join(keymapsDir, `base-${process.platform}.json`));
    if (template) {
      manager.loadKeymap(path.join(templatesDir, `${template}.json`), {
        replaceExistingCommands: true,
      });
    }
    return manager.getBindingsForAllCommands() as { [command: string]: string[] };
  };

  it('finds the shipped templates', function () {
    expect(templates).toContain('Gmail');
    expect(templates).toContain('Outlook');
  });

  for (const template of templates) {
    it(`${template} keeps every base keystroke it does not intentionally drop`, function () {
      const base = bindingsWith();
      const withTemplate = bindingsWith(template);
      const dropped = intentionallyDropped[template] || {};
      const missing: string[] = [];

      for (const command of Object.keys(base)) {
        const kept = (withTemplate[command] || []).map(normalize);
        const allowed = (dropped[command] || []).map(normalize);
        for (const keystroke of base[command].map(normalize)) {
          if (!kept.includes(keystroke) && !allowed.includes(keystroke)) {
            missing.push(`${command}: ${keystroke}`);
          }
        }
      }

      expect(missing).toEqual([]);
    });
  }
});
