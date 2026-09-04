import path from 'path';
import KeymapManager from '../src/keymap-manager';

describe('KeymapManager', function () {
  it('uses template bindings while preserving inherited commands', function () {
    const resourcePath = AppEnv.getLoadSettings().resourcePath;
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    const baseKeymap = manager.loadKeymap(path.join(resourcePath, 'keymaps', 'base.json'));
    const outlookKeymap = manager.loadKeymap(
      path.join(resourcePath, 'keymaps', 'templates', 'Outlook.json'),
      { replaceExistingCommands: true }
    );

    expect(manager.getBindingsForCommand('application:quit')).toEqual(['alt+f4']);
    expect(manager.getBindingsForCommand('core:copy')).toEqual(['mod+c']);
    expect((manager as any)._commandsCache['ctrl+q']).toEqual(['core:mark-as-read']);
    expect((manager as any)._commandsCache['ctrl+u']).toEqual([
      'contenteditable:underline',
      'core:mark-as-unread',
    ]);

    outlookKeymap.dispose();
    baseKeymap.dispose();
  });
});
