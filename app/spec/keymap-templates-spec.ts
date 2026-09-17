import fs from 'fs';
import path from 'path';
import mousetrap from 'mousetrap';
import KeymapManager from '../src/keymap-manager';

// Templates replace the base bindings of every command they define, so each one
// must restate the base keystrokes it wants to keep, base keystroke first so the
// menu accelerator (taken from the first keystroke) is unchanged. Any base
// keystroke a template drops must be listed here as deliberate.
const intentionallyDropped: { [template: string]: { [command: string]: string[] } } = {
  // Outlook maps ctrl+q to mark-as-read; command+q keeps quit on macOS and
  // alt+f4 covers Windows and Linux.
  Outlook: { 'application:quit': ['mod+q'] },
};

const platforms = ['darwin', 'win32', 'linux'];

describe('Keymap templates', function () {
  const resourcePath = AppEnv.getLoadSettings().resourcePath;
  const keymapsDir = path.join(resourcePath, 'keymaps');
  const templatesDir = path.join(keymapsDir, 'templates');
  const templates = fs
    .readdirSync(templatesDir)
    .filter((filename) => path.extname(filename) === '.json')
    .map((filename) => path.parse(filename).name);

  beforeEach(function () {
    const trap = new mousetrap(document.body);
    spyOn(mousetrap, 'bind').andCallFake((keys, callback) => trap.bind(keys, callback));
  });

  // Bindings are stored unnormalized, so a manager can resolve any platform's
  // base files here and the comparison normalizes `mod` for that platform.
  const bindingsFor = (platform: string, template?: string) => {
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    manager.loadKeymap(path.join(keymapsDir, 'base.json'), { layer: 'base' });
    manager.loadKeymap(path.join(keymapsDir, `base-${platform}.json`), { layer: 'base' });
    if (template) {
      manager.loadKeymap(path.join(templatesDir, `${template}.json`), { layer: 'template' });
    }
    return manager.getBindingsForAllCommands() as { [command: string]: string[] };
  };

  const normalizeFor = (platform: string) => (keystrokes: string) =>
    keystrokes.replace(/\bmod\b/g, platform === 'darwin' ? 'command' : 'ctrl');

  it('finds the shipped templates', function () {
    expect(templates).toContain('Gmail');
    expect(templates).toContain('Outlook');
  });

  for (const template of templates) {
    for (const platform of platforms) {
      it(`${template} on ${platform} keeps every base keystroke it does not intentionally drop, base first`, function () {
        const normalize = normalizeFor(platform);
        const base = bindingsFor(platform);
        const withTemplate = bindingsFor(platform, template);
        const dropped = intentionallyDropped[template] || {};
        const problems: string[] = [];

        for (const command of Object.keys(base)) {
          const kept = (withTemplate[command] || []).map(normalize);
          const allowed = (dropped[command] || []).map(normalize);
          const expected = base[command].map(normalize).filter((k) => !allowed.includes(k));
          for (const keystroke of expected) {
            if (!kept.includes(keystroke)) {
              problems.push(`${command} lost ${keystroke}`);
            }
          }
          if (expected.length && !expected.every((k, i) => kept[i] === k)) {
            problems.push(`${command} does not list base keystrokes first: ${kept.join(', ')}`);
          }
        }

        expect(problems).toEqual([]);
      });
    }
  }
});
