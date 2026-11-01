type MenuPosition = { x?: number; y?: number; callback?: () => void };

interface MenuItemOptions {
  id?: string;
  label?: string;
  sublabel?: string;
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  role?: string;
  accelerator?: string;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  submenu?: MenuItemOptions[] | StyledMenu;
  click?: (...args: any[]) => void;
}

const ROLE_METHODS = ['undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll'];
const VIEWPORT_MARGIN = 8;

let closeOpenMenu: (() => void) | null = null;
const lastPointer = { x: 0, y: 0 };

function shortcutLabel(accelerator: string) {
  return accelerator.replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/, 'Ctrl');
}

/** API-compatible with Electron's MenuItem, for the fields the app and plugins use. */
export class StyledMenuItem {
  id?: string;
  label = '';
  sublabel?: string;
  type: MenuItemOptions['type'] = 'normal';
  role?: string;
  accelerator?: string;
  enabled = true;
  visible = true;
  checked = false;
  submenu?: StyledMenu;
  click: (...args: any[]) => void;

  constructor({ submenu, click, ...options }: MenuItemOptions) {
    Object.assign(this, options);
    if (submenu) {
      this.type = 'submenu';
      this.submenu =
        submenu instanceof StyledMenu ? submenu : StyledMenu.buildFromTemplate(submenu);
    }
    this.click = click || (() => this._runRole());
  }

  private _runRole() {
    if (ROLE_METHODS.includes(this.role)) {
      require('@electron/remote').getCurrentWebContents()[this.role]();
    }
  }
}

/** API-compatible with Electron's Menu; `popup` draws in the page rather than opening a native menu. */
export class StyledMenu {
  items: StyledMenuItem[] = [];

  static buildFromTemplate(template: Array<MenuItemOptions | StyledMenuItem>) {
    const menu = new StyledMenu();
    template.forEach((item) => menu.append(item));
    return menu;
  }

  /** Mirrors a main-process menu, such as the application menu, reached through remote. */
  static fromRemote(remoteMenu: { items: any[] }): StyledMenu {
    const menu = new StyledMenu();
    for (const item of remoteMenu.items) {
      if (!item.visible) continue;
      menu.append({
        label: item.label,
        type: item.type,
        enabled: item.enabled,
        checked: item.checked,
        accelerator: item.accelerator,
        submenu: item.submenu ? StyledMenu.fromRemote(item.submenu) : undefined,
        click: () => item.click(),
      });
    }
    return menu;
  }

  append(item: MenuItemOptions | StyledMenuItem) {
    this.items.push(item instanceof StyledMenuItem ? item : new StyledMenuItem(item));
  }

  insert(position: number, item: MenuItemOptions | StyledMenuItem) {
    this.items.splice(
      position,
      0,
      item instanceof StyledMenuItem ? item : new StyledMenuItem(item)
    );
  }

  popup({ x = lastPointer.x, y = lastPointer.y, callback }: MenuPosition = {}) {
    openMenu(this, x, y, callback);
  }

  closePopup() {
    if (closeOpenMenu) closeOpenMenu();
  }
}

function renderableItems(menu: StyledMenu) {
  const visible = menu.items.filter((item) => item.visible);
  return visible.filter((item, index) => {
    if (item.type !== 'separator') return true;
    const previous = visible[index - 1];
    return index > 0 && index < visible.length - 1 && previous.type !== 'separator';
  });
}

function buildRow(item: StyledMenuItem) {
  if (item.type === 'separator') {
    const separator = document.createElement('div');
    separator.className = 'styled-menu-separator';
    separator.setAttribute('role', 'separator');
    return separator;
  }

  const row = document.createElement('div');
  const checkable = item.type === 'checkbox' || item.type === 'radio';
  row.className = 'styled-menu-item';
  row.classList.toggle('disabled', !item.enabled);
  row.setAttribute('role', checkable ? 'menuitemcheckbox' : 'menuitem');
  row.setAttribute('aria-disabled', String(!item.enabled));
  if (checkable) row.setAttribute('aria-checked', String(item.checked));
  if (item.submenu) row.setAttribute('aria-haspopup', 'menu');

  const addCell = (className: string, text = '') => {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = text;
    row.appendChild(cell);
  };
  addCell('styled-menu-check', checkable && item.checked ? '✓' : '');
  addCell('styled-menu-label', item.label);
  if (item.accelerator) addCell('styled-menu-shortcut', shortcutLabel(item.accelerator));
  if (item.submenu) addCell('styled-menu-arrow', '›');
  return row;
}

function openMenu(menu: StyledMenu, x: number, y: number, onClose?: () => void) {
  if (closeOpenMenu) closeOpenMenu();

  const layer = document.createElement('div');
  layer.className = 'styled-menu-layer';
  document.body.appendChild(layer);
  // Keeps focus and the text selection in place, so Copy and Paste act on the right target.
  layer.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (event.target === layer) close();
  });
  layer.addEventListener('contextmenu', (event) => event.preventDefault());

  type Panel = {
    element: HTMLElement;
    items: StyledMenuItem[];
    rows: HTMLElement[];
    active: number;
  };
  const panels: Panel[] = [];

  const closePanelsAfter = (depth: number) => {
    while (panels.length > depth + 1) panels.pop().element.remove();
  };

  const setActive = (panel: Panel, index: number) => {
    panel.rows.forEach((row, i) => row.classList.toggle('active', i === index));
    panel.active = index;
  };

  const activate = (item: StyledMenuItem) => {
    if (!item.enabled || item.submenu) return;
    close();
    item.click(item);
  };

  const openPanel = (target: StyledMenu, left: number, top: number, parentRow?: HTMLElement) => {
    const depth = panels.length;
    const element = document.createElement('div');
    element.className = 'styled-menu';
    element.setAttribute('role', 'menu');
    const items = renderableItems(target).filter((item) => item.type !== 'separator');
    const panel: Panel = { element, items, rows: [], active: -1 };

    for (const item of renderableItems(target)) {
      const row = buildRow(item);
      element.appendChild(row);
      if (item.type === 'separator') continue;
      const index = panel.rows.length;
      panel.rows.push(row);
      row.addEventListener('mouseenter', () => {
        closePanelsAfter(depth);
        setActive(panel, item.enabled ? index : -1);
        if (item.enabled && item.submenu) openSubmenu(panel, index);
      });
      row.addEventListener('click', () => activate(item));
    }

    layer.appendChild(element);
    panels.push(panel);

    const { width, height } = element.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;
    const parent = parentRow?.getBoundingClientRect();
    const flipped = parent && left > maxLeft ? parent.left - width : left;
    element.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(flipped, maxLeft))}px`;
    element.style.top = `${Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop))}px`;
    return panel;
  };

  const openSubmenu = (panel: Panel, index: number) => {
    const rect = panel.rows[index].getBoundingClientRect();
    return openPanel(panel.items[index].submenu, rect.right, rect.top - 5, panel.rows[index]);
  };

  const moveActive = (panel: Panel, delta: number) => {
    const count = panel.items.length;
    for (let step = 1; step <= count; step++) {
      const start = panel.active === -1 && delta < 0 ? 0 : panel.active;
      const index = (start + delta * step + count * step) % count;
      if (panel.items[index].enabled) {
        setActive(panel, index);
        panel.rows[index].scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const panel = panels[panels.length - 1];
    const item = panel.items[panel.active];
    switch (event.key) {
      case 'Escape':
        if (panels.length > 1) closePanelsAfter(panels.length - 2);
        else close();
        break;
      case 'ArrowDown':
        moveActive(panel, 1);
        break;
      case 'ArrowUp':
        moveActive(panel, -1);
        break;
      case 'ArrowRight':
        if (item?.submenu) moveActive(openSubmenu(panel, panel.active), 1);
        break;
      case 'ArrowLeft':
        if (panels.length > 1) closePanelsAfter(panels.length - 2);
        break;
      case 'Enter':
      case ' ':
        if (item?.submenu) moveActive(openSubmenu(panel, panel.active), 1);
        else if (item) activate(item);
        break;
    }
  };

  function close() {
    if (closeOpenMenu !== close) return;
    closeOpenMenu = null;
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    layer.remove();
    if (onClose) onClose();
  }

  closeOpenMenu = close;
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  openPanel(menu, x, y);
}

function rememberPointer(event: MouseEvent) {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
}

/**
 * Serves StyledMenu from `require('@electron/remote')` so every existing call site and plugin
 * gets it. remote's exports are non-configurable getters, so the cached module is swapped for
 * one that shadows them. Must run before anything else reads `Menu` from remote.
 */
export function installStyledMenus() {
  const remotePath = require.resolve('@electron/remote');
  const remote = require('@electron/remote');
  require.cache[remotePath].exports = Object.create(remote, {
    Menu: { value: StyledMenu },
    MenuItem: { value: StyledMenuItem },
  });
  window.addEventListener('mousedown', rememberPointer, true);
  window.addEventListener('contextmenu', rememberPointer, true);
}
