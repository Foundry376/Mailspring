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
      path.join(resourcePath, 'keymaps', 'templates', 'Outlook.json')
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

  it('layers template bindings on top of the base keymap', function () {
    const resourcePath = AppEnv.getLoadSettings().resourcePath;
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    const baseKeymap = manager.loadKeymap(path.join(resourcePath, 'keymaps', 'base.json'));
    const outlookKeymap = manager.loadKeymap(
      path.join(resourcePath, 'keymaps', 'templates', 'Outlook.json')
    );

    expect(manager.getBindingsForCommand('application:quit')).toEqual(['mod+q', 'alt+f4']);
    expect(manager.getBindingsForCommand('core:focus-item')).toEqual(['enter', 'ctrl+o']);
    expect(manager.getBindingsForCommand('core:copy')).toEqual(['mod+c']);
    expect((manager as any)._commandsCache['ctrl+q']).toEqual(['core:mark-as-read']);

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

    outlookKeymap.dispose();
    baseKeymap.dispose();
  });

  it('keeps base arrow-key navigation when a template rebinds the same commands', function () {
    const resourcePath = AppEnv.getLoadSettings().resourcePath;
    const manager = new KeymapManager({ configDirPath: resourcePath, resourcePath });
    const baseKeymap = manager.loadKeymap(path.join(resourcePath, 'keymaps', 'base.json'));
    const gmailKeymap = manager.loadKeymap(
      path.join(resourcePath, 'keymaps', 'templates', 'Gmail.json')
    );

    expect(manager.getBindingsForCommand('core:previous-item')).toEqual(['up', 'k']);
    expect(manager.getBindingsForCommand('core:next-item')).toEqual(['down', 'j']);
    expect((manager as any)._commandsCache['down']).toEqual(['core:next-item']);
    expect((manager as any)._commandsCache['j']).toEqual(['core:next-item']);

    gmailKeymap.dispose();
    baseKeymap.dispose();
  });
});
