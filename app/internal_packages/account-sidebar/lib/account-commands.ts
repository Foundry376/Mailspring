/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Actions, Account, MenuHelpers } from 'mailspring-exports';

let _commandsDisposable = null;

interface IAccountMenuItem extends Electron.MenuItemConstructorOptions {
  command?: string;
  account?: boolean;
}

export function _isSelected(account, sidebarAccountIds) {
  if (sidebarAccountIds.length > 1) {
    return account instanceof Array;
  } else if (sidebarAccountIds.length === 1) {
    return (account != null ? account.id : undefined) === sidebarAccountIds[0];
  } else {
    return false;
  }
}

export function menuItem(
  account: Account,
  idx: number,
  { isSelected, clickHandlers }: { isSelected?: boolean; clickHandlers?: boolean } = {}
) {
  const item: IAccountMenuItem = {
    label: account.label != null ? account.label : 'All Accounts',
    command: `window:select-account-${idx}`,
    account: true,
  };
  if (isSelected) {
    item.type = 'checkbox';
    item.checked = true;
  }
  if (clickHandlers) {
    const accounts = account instanceof Array ? account : [account];
    item.click = _focusAccounts.bind(null, accounts);
    item.accelerator = `CmdOrCtrl+${idx + 1}`;
  }
  return item;
}

export function menuTemplate(
  accounts,
  sidebarAccountIds,
  { clickHandlers }: { clickHandlers?: boolean } = {}
) {
  let isSelected;
  let template = [];
  const multiAccount = accounts.length > 1;

  if (multiAccount) {
    isSelected = _isSelected(accounts, sidebarAccountIds);
    template = [menuItem(accounts, 0, { isSelected, clickHandlers })];
  }

  template = template.concat(
    accounts.map((account, idx) => {
      // If there's only one account, it should be mapped to command+1, not command+2
      const accIdx = multiAccount ? idx + 1 : idx;
      isSelected = _isSelected(account, sidebarAccountIds);
      return menuItem(account, accIdx, { isSelected, clickHandlers });
    })
  );
  return template;
}

export function _focusAccounts(accounts) {
  Actions.focusDefaultMailboxPerspectiveForAccounts(accounts);
  if (!AppEnv.isVisible()) {
    AppEnv.show();
  }
}

export function registerCommands(accounts) {
  if (_commandsDisposable != null) {
    _commandsDisposable.dispose();
  }
  const commands = {};

  const allKey = 'window:select-account-0';
  commands[allKey] = _focusAccounts.bind(this, accounts);

  [1, 2, 3, 4, 5, 6, 7, 8].forEach(index => {
    const account = accounts[index - 1];
    if (!account) {
      return;
    }
    const key = `window:select-account-${index}`;
    commands[key] = _focusAccounts.bind(this, [account]);
  });

  _commandsDisposable = AppEnv.commands.add(document.body, commands);
}

export function registerMenuItems(accounts: Account[], sidebarAccountIds: string[]) {
  const windowMenu = AppEnv.menu.template.find(
    ({ label }) => MenuHelpers.normalizeLabel(label) === 'Window'
  );
  if (!windowMenu) {
    return;
  }

  const submenu = windowMenu.submenu.filter(item => !(item as any).account);
  if (!submenu) {
    return;
  }

  const idx = submenu.findIndex(({ type }) => type === 'separator');
  if (!(idx > 0)) {
    return;
  }

  const template = menuTemplate(accounts, sidebarAccountIds);
  submenu.splice(idx + 1, 0, ...template);
  windowMenu.submenu = submenu;
  AppEnv.menu.update();
}

export function register(accounts: Account[], sidebarAccountIds: string[]) {
  registerCommands(accounts);
  registerMenuItems(accounts, sidebarAccountIds);
}
