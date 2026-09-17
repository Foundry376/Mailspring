import path from 'path';
import mousetrap from 'mousetrap';
import KeymapManager from '../src/keymap-manager';

describe('KeymapManager', function () {
  const resourcePath = AppEnv.getLoadSettings().resourcePath;
  const keymapsDir = path.join(resourcePath, 'keymaps');
  let manager: KeymapManager;
  let trap: InstanceType<typeof mousetrap>;

  beforeEach(function () {
    // Isolate registrations from AppEnv.keymaps while retaining Mailspring's real
    // stopCallback: a bare mousetrap.bind would steal the app's global bindings.
    trap = new mousetrap(document.body);
    spyOn(mousetrap, 'bind').andCallFake((keys, callback) => trap.bind(keys, callback));
    manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
  });

  afterEach(function () {
    trap.reset();
  });

  if (process.platform !== 'darwin') {
    it('dispatches both mod and ctrl commands before propagation stops on Windows', function () {
      spyOn(AppEnv.commands, 'dispatch');
      manager.loadKeymap(path.join(keymapsDir, 'base.json'), { layer: 'base' });
      manager.loadKeymap(path.join(keymapsDir, 'templates', 'Outlook.json'), {
        layer: 'template',
      });

      const event = new KeyboardEvent('keydown', { key: 'u', ctrlKey: true });
      Object.defineProperty(event, 'target', { value: document.body });
      trap.handleKey('u', ['ctrl'], event);
      expect(AppEnv.commands.dispatch).toHaveBeenCalledWith('contenteditable:underline');
      expect(AppEnv.commands.dispatch).toHaveBeenCalledWith('core:mark-as-unread');
    });
  }

  it('replaces base bindings for the commands a template defines', function () {
    manager.loadKeymap(path.join(keymapsDir, 'base.json'), { layer: 'base' });
    manager.loadKeymap(path.join(keymapsDir, 'templates', 'Outlook.json'), { layer: 'template' });

    expect(manager.getBindingsForCommand('application:quit')).toEqual(['command+q', 'alt+f4']);
    expect(manager.getBindingsForCommand('core:focus-item')).toEqual(['enter', 'ctrl+o']);
    expect(manager.getBindingsForCommand('core:copy')).toEqual(['mod+c']);
    expect((manager as any)._commandsCache['ctrl+q']).toEqual(['core:mark-as-read']);
    expect((manager as any)._commandsCache['ctrl+o']).toEqual(['core:focus-item']);

    // The base keymap binds underline to mod+u, which only collides with Outlook's
    // ctrl+u on platforms where mod resolves to ctrl.
    if (process.platform === 'darwin') {
      expect((manager as any)._commandsCache['command+u']).toEqual(['contenteditable:underline']);
      expect((manager as any)._commandsCache['ctrl+u']).toEqual(['core:mark-as-unread']);
    } else {
      expect((manager as any)._commandsCache['ctrl+u']).toEqual([
        'contenteditable:underline',
        'core:mark-as-unread',
      ]);
    }
  });

  it('keeps base arrow-key navigation when a template rebinds the same commands', function () {
    manager.loadKeymap(path.join(keymapsDir, 'base.json'), { layer: 'base' });
    manager.loadKeymap(path.join(keymapsDir, 'templates', 'Gmail.json'), { layer: 'template' });

    expect(manager.getBindingsForCommand('core:previous-item')).toEqual(['up', 'k']);
    expect(manager.getBindingsForCommand('core:next-item')).toEqual(['down', 'j']);
    expect((manager as any)._commandsCache['down']).toEqual(['core:next-item']);
    expect((manager as any)._commandsCache['j']).toEqual(['core:next-item']);
  });

  it('adds package keymaps on top of a template even when they were loaded first', function () {
    // In the main window, packages activate (and load their keymaps) before
    // loadKeymaps() runs, and a template chosen in Preferences loads last of all.
    manager.loadKeymap(
      path.join(resourcePath, 'internal_packages', 'composer', 'keymaps', 'composer.json')
    );
    manager.loadKeymap(path.join(keymapsDir, 'base.json'), { layer: 'base' });
    manager.loadKeymap(path.join(keymapsDir, 'templates', 'Outlook.json'), { layer: 'template' });

    expect(manager.getBindingsForCommand('composer:send-message')).toEqual(['alt+s', 'mod+enter']);
    expect(manager.getBindingsForCommand('composer:focus-to')).toEqual(['mod+shift+t']);
  });
});
