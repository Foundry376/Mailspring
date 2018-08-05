const { TouchBar, nativeImage } = require('electron');
const path = require('path');

const { TouchBarGroup, TouchBarButton, TouchBarSpacer } = TouchBar;

/*
Mailspring's touch bar implementation leverages the existing `menu templating`
system. When the menu template is updated to enable/disable items, the template
is also provided to the ApplicationTouchBar. The currently available menu
commands are used to hide/show relevant touch bar items.
*/
function makeCommandButton(options) {
  const b = new TouchBarButton(
    Object.assign(options, {
      click: () => global.application.sendCommand(options.command),
    })
  );
  b.group = options.group;
  b.command = options.command;
  return b;
}

export default class ApplicationTouchBar {
  constructor(resourcePath) {
    this._touchbar = null;
    this._hash = '';

    const iconRoot = path.join(resourcePath, 'static', 'images', 'touchbar');

    this._items = [
      makeCommandButton({
        command: 'core:focus-search',
        backgroundColor: '#9E50E1',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-search@2x.png')),
      }),
      makeCommandButton({
        command: 'application:new-message',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-compose@2x.png')),
      }),
      new TouchBarSpacer({ size: 'small' }),
      makeCommandButton({
        group: 'remove',
        command: 'core:archive-item',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-archive@2x.png')),
      }),
      makeCommandButton({
        group: 'remove',
        command: 'core:delete-item',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-trash@2x.png')),
      }),
      new TouchBarSpacer({ size: 'small' }),
      makeCommandButton({
        group: 'move',
        command: 'core:snooze-item',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-snooze@2x.png')),
      }),
      makeCommandButton({
        group: 'move',
        command: 'core:change-folders',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-change-folders@2x.png')),
      }),
      makeCommandButton({
        group: 'move',
        command: 'core:change-labels',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-change-labels@2x.png')),
      }),
      new TouchBarSpacer({ size: 'small' }),
      makeCommandButton({
        group: 'flags',
        command: 'core:mark-as-read',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-mark-as-read@2x.png')),
      }),
      makeCommandButton({
        group: 'flags',
        command: 'core:mark-as-unread',
        icon: nativeImage.createFromPath(path.join(iconRoot, 'touchbar-mark-as-unread@2x.png')),
      }),
    ];
  }

  getCommandsEnabledInMenu(template) {
    // Recursively iterate through the menu tree and find all of the
    // menu items with a `command` that are enabled.
    const menus = [].concat(template);
    const availableCommands = {};
    let menu = null;
    while ((menu = menus.pop())) {
      if (menu.submenu) {
        menus.push(...menu.submenu);
      }
      if (menu.command && menu.enabled !== false) {
        availableCommands[menu.command] = true;
      }
    }
    return availableCommands;
  }

  update(menuTemplate) {
    const availableCommands = this.getCommandsEnabledInMenu(menuTemplate);
    const nextItems = this._items.filter(i => !i.command || availableCommands[i.command]);

    // The search item should always be available - if it's not present,
    // the window most likely has not finished loading yet and applying
    // the template would just cause the touchbar to flicker.
    if (!availableCommands['core:focus-search']) {
      return;
    }

    // Compute a hash of the selected set of touch bar items so
    // we can avoid rebuilding the bar if the items are the same.
    const nextHash = nextItems.map(i => i.command || '').join(',');
    if (this._hash === nextHash) {
      return;
    }
    this._hash = nextHash;

    // Take a single linear pass through the touch bar items and place
    // consecutive items with the same `group` key into touchbar groups.
    // This results in /very slightly/ tighter spacing in the touchbar.
    const final = [];
    let group = [];
    let groupName = null;

    const flushGroupIfPresent = () => {
      if (!group.length) return;
      final.push(new TouchBarGroup({ items: new TouchBar(group) }));
      groupName = null;
      group = [];
    };

    nextItems.forEach(i => {
      if (i.group) {
        if (groupName !== i.group) {
          flushGroupIfPresent();
          groupName = i.group;
        }
        group.push(i);
      } else {
        flushGroupIfPresent();
        final.push(i);
      }
    });

    flushGroupIfPresent();

    const win = global.application.getMainWindow();
    if (!win) return;
    win.setTouchBar(new TouchBar(final));
  }
}
