import path from 'path';

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.originalSetTimeout(resolve, milliseconds));

describe('Keymap input integration', function () {
  it('dispatches Outlook read shortcuts from physical key events', async function () {
    const resourcePath = AppEnv.getLoadSettings().resourcePath;
    const outlookKeymap = AppEnv.keymaps.loadKeymap(
      path.join(resourcePath, 'keymaps', 'templates', 'Outlook.json'),
      { replaceExistingCommands: true }
    );
    const receivedCommands: string[] = [];
    const commandHandlers = AppEnv.commands.add(document.body, {
      'core:mark-as-read': () => receivedCommands.push('core:mark-as-read'),
      'core:mark-as-unread': () => receivedCommands.push('core:mark-as-unread'),
    });

    try {
      await wait(250);
      const webContents = AppEnv.getCurrentWindow().webContents;
      webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Q', modifiers: ['control'] });
      webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Q', modifiers: ['control'] });
      webContents.sendInputEvent({ type: 'keyDown', keyCode: 'U', modifiers: ['control'] });
      webContents.sendInputEvent({ type: 'keyUp', keyCode: 'U', modifiers: ['control'] });
      await wait(100);

      expect(receivedCommands).toEqual(['core:mark-as-read', 'core:mark-as-unread']);
    } finally {
      commandHandlers.dispose();
      outlookKeymap.dispose();
    }
  });
});
