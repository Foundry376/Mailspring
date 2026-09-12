import path from 'path';
import mousetrap from 'mousetrap';
import KeymapManager from '../src/keymap-manager';

describe('KeymapManager', function () {
  it('dispatches both mod and ctrl commands before propagation stops on Windows', function () {
    if (process.platform === 'darwin') {
      return;
    }
    const resourcePath = AppEnv.getLoadSettings().resourcePath;
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    // Isolate registrations while retaining Mailspring's real stopCallback.
    const trap = new mousetrap(document.body);
    spyOn(mousetrap, 'bind').andCallFake((keys, callback) => trap.bind(keys, callback));
    spyOn(AppEnv.commands, 'dispatch');
    const baseKeymap = manager.loadKeymap(path.join(resourcePath, 'keymaps', 'base.json'));
    const outlookKeymap = manager.loadKeymap(
      path.join(resourcePath, 'keymaps', 'templates', 'Outlook.json'),
      { replaceExistingCommands: true }
    );

    try {
      const event = new KeyboardEvent('keydown', { key: 'u', ctrlKey: true });
      Object.defineProperty(event, 'target', { value: document.body });
      trap.handleKey('u', ['ctrl'], event);
      expect(AppEnv.commands.dispatch).toHaveBeenCalledWith('contenteditable:underline');
      expect(AppEnv.commands.dispatch).toHaveBeenCalledWith('core:mark-as-unread');
    } finally {
      outlookKeymap.dispose();
      baseKeymap.dispose();
      trap.reset();
    }
  });

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
