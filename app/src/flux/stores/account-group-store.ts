import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import * as Utils from '../models/utils';
import AccountStore from './account-store';

const configKey = 'accountGroups';

export type AccountGroupDisplayStyle = 'normal' | 'bold' | 'italic' | 'bold-italic';

export interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[];
  color?: string;
  displayStyle?: AccountGroupDisplayStyle;
}

class _AccountGroupStore extends MailspringStore {
  private _groups: AccountGroup[] = [];

  constructor() {
    super();
    this._loadGroups();
    this.listenTo(Actions.createAccountGroup, this._onCreate);
    this.listenTo(Actions.updateAccountGroup, this._onUpdate);
    this.listenTo(Actions.deleteAccountGroup, this._onDelete);
    this.listenTo(Actions.reorderAccountGroup, this._onReorder);
    this.listenTo(AccountStore, this._onAccountsChanged);
  }

  groups(): AccountGroup[] {
    return this._groups;
  }

  groupForId(id: string): AccountGroup | undefined {
    return this._groups.find(g => g.id === id);
  }

  private _loadGroups() {
    this._groups = (AppEnv.config.get(configKey) as AccountGroup[]) || [];
  }

  private _saveGroups() {
    AppEnv.config.set(configKey, this._groups);
  }

  private _onCreate = ({ name, accountIds }: { name: string; accountIds: string[] }) => {
    this._groups = [
      ...this._groups,
      {
        id: Utils.generateTempId(),
        name,
        accountIds,
        color: '',
        displayStyle: 'normal',
      },
    ];
    this._saveGroups();
    this.trigger();
  };

  private _onUpdate = (updates: Partial<AccountGroup> & { id: string }) => {
    this._groups = this._groups.map(g => {
      if (g.id !== updates.id) return g;
      const result = { ...g };
      if (updates.name !== undefined) result.name = updates.name;
      if (updates.accountIds !== undefined) result.accountIds = updates.accountIds;
      if (updates.color !== undefined) result.color = updates.color;
      if (updates.displayStyle !== undefined) result.displayStyle = updates.displayStyle;
      return result;
    });
    this._saveGroups();
    this.trigger();
  };

  private _onDelete = ({ id }: { id: string }) => {
    this._groups = this._groups.filter(g => g.id !== id);
    this._saveGroups();
    this.trigger();
  };

  private _onAccountsChanged = () => {
    const validIds = new Set(AccountStore.accounts().map(a => a.id));
    let changed = false;
    const cleaned = this._groups.map(g => {
      const filtered = g.accountIds.filter(id => validIds.has(id));
      if (filtered.length !== g.accountIds.length) {
        changed = true;
        return { ...g, accountIds: filtered };
      }
      return g;
    });
    if (changed) {
      this._groups = cleaned;
      this._saveGroups();
      this.trigger();
    }
  };

  private _onReorder = ({ id, newIdx }: { id: string; newIdx: number }) => {
    const groups = [...this._groups];
    const oldIdx = groups.findIndex(g => g.id === id);
    if (oldIdx === -1) return;
    const [group] = groups.splice(oldIdx, 1);
    groups.splice(newIdx, 0, group);
    this._groups = groups;
    this._saveGroups();
    this.trigger();
  };
}

export default new _AccountGroupStore();
