import { Categories } from 'mailspring-observables';
import MailspringStore from 'mailspring-store';
import { AccountStore } from './account-store';
import { Account } from '../models/account';
import { Category } from '../models/category';
import { Folder } from '../models/folder';
import { Label } from '../models/label';

const asAccount = (a: Account | string) => {
  if (!a) {
    throw new Error('You must pass an Account or Account Id');
  }
  return a instanceof Account ? a : AccountStore.accountForId(a);
};

const asAccountId = (a: Account | string) => {
  if (!a) {
    throw new Error('You must pass an Account or Account Id');
  }
  return a instanceof Account ? a.id : a;
};

class CategoryStore extends MailspringStore {
  _categoryCache = {};
  _standardCategories: { [accountId: string]: Array<Folder | Label> } = {};
  _userCategories: { [accountId: string]: Array<Folder | Label> } = {};
  _hiddenCategories: { [accountId: string]: Array<Folder | Label> } = {};
  _categoryResult;

  constructor() {
    super();

    AppEnv.config.onDidChange('core.workspace.showImportant', () => {
      if (this._categoryResult) {
        this._onCategoriesChanged(this._categoryResult);
      }
    });

    Categories.forAllAccounts().sort().subscribe(this._onCategoriesChanged);
  }

  byId(accountOrId: Account | string, categoryId: string) {
    const categories = this._categoryCache[asAccountId(accountOrId)] || {};
    return categories[categoryId];
  }

  // Public: Returns an array of all categories for an account, both
  // standard and user generated. The items returned by this function will be
  // either {Folder} or {Label} objects.
  //
  categories(accountOrId: Account | string | null = null) {
    if (accountOrId) {
      const cached = this._categoryCache[asAccountId(accountOrId)];
      return cached ? Object.values(cached) : [];
    }
    let all = [];
    for (const accountCategories of Object.values(this._categoryCache)) {
      all = all.concat(Object.values(accountCategories));
    }
    return all;
  }

  // Public: Returns all of the standard categories for the given account.
  //
  standardCategories(accountOrId: Account | string) {
    return this._standardCategories[asAccountId(accountOrId)] || [];
  }

  hiddenCategories(accountOrId: Account | string) {
    return this._hiddenCategories[asAccountId(accountOrId)] || [];
  }

  // Public: Returns all of the categories that are not part of the standard
  // category set.
  //
  userCategories(accountOrId: Account | string) {
    return this._userCategories[asAccountId(accountOrId)] || [];
  }

  // Public: Returns the Folder or Label object for a standard category name and
  // for a given account.
  // ('inbox', 'drafts', etc.) It's possible for this to return `null`.
  // For example, Gmail likely doesn't have an `archive` label.
  //
  getCategoryByRole(accountOrId: Account | string | null, role: string) {
    if (!accountOrId) {
      return null;
    }

    if (!Category.StandardRoles.includes(role)) {
      throw new Error(`'${role}' is not a standard category`);
    }

    const accountCategories = this._standardCategories[asAccountId(accountOrId)];
    return (accountCategories && accountCategories.find((c) => c.role === role)) || null;
  }

  // Public: Returns the set of all standard categories that match the given
  // names for each of the provided accounts
  getCategoriesWithRoles(
    accountsOrIds: Account | string | (Account | string)[],
    ...names: string[]
  ) {
    if (Array.isArray(accountsOrIds)) {
      let res = [];
      for (const accOrId of accountsOrIds) {
        const cats = names.map((name) => this.getCategoryByRole(accOrId, name));
        res = res.concat(cats.filter(Boolean));
      }
      return res;
    }
    return names.map((name) => this.getCategoryByRole(accountsOrIds, name)).filter(Boolean);
  }

  // Public: Returns the Folder or Label object that should be used for "Archive"
  // actions. On Gmail, this is the "all" label. On providers using folders, it
  // returns any available "Archive" folder, or null if no such folder exists.
  //
  getArchiveCategory(accountOrId: Account | string | null) {
    if (!accountOrId) {
      return null;
    }
    const account = asAccount(accountOrId);
    if (!account) {
      return null;
    }

    return (
      this.getCategoryByRole(account.id, 'archive') || this.getCategoryByRole(account.id, 'all')
    );
  }

  // Public: Returns Label object for "All mail"
  //
  getAllMailCategory(accountOrId: Account | string | null) {
    if (!accountOrId) {
      return null;
    }
    const account = asAccount(accountOrId);
    if (!account) {
      return null;
    }

    return this.getCategoryByRole(account.id, 'all');
  }

  // Public: Returns the Folder or Label object that should be used for
  // the inbox or null if it doesn't exist
  //
  getInboxCategory(accountOrId: Account | string | null) {
    return this.getCategoryByRole(accountOrId, 'inbox');
  }

  // Public: Returns the Folder or Label object that should be used for
  // "Move to Trash", or null if no trash folder exists.
  //
  getTrashCategory(accountOrId: Account | string | null) {
    return this.getCategoryByRole(accountOrId, 'trash');
  }

  // Public: Returns the Folder or Label object that should be used for
  // "Move to Spam", or null if no trash folder exists.
  //
  getSpamCategory(accountOrId: Account | string | null) {
    return this.getCategoryByRole(accountOrId, 'spam');
  }

  _onCategoriesChanged = (categories: (Folder | Label)[]) => {
    this._categoryResult = categories;
    this._categoryCache = {};
    for (const cat of categories) {
      this._categoryCache[cat.accountId] = this._categoryCache[cat.accountId] || {};
      this._categoryCache[cat.accountId][cat.id] = cat;
    }

    const filteredByAccount = (fn) => {
      const result = {};
      for (const cat of categories) {
        if (!fn(cat)) {
          continue;
        }
        result[cat.accountId] = result[cat.accountId] || [];
        result[cat.accountId].push(cat);
      }
      return result;
    };

    this._standardCategories = filteredByAccount((cat) => cat.isStandardCategory());
    this._userCategories = filteredByAccount((cat) => cat.isUserCategory());
    this._hiddenCategories = filteredByAccount((cat) => cat.isHiddenCategory());

    // Ensure standard categories are always sorted in the correct order
    for (const accountCategories of Object.values(this._standardCategories)) {
      accountCategories.sort(
        (a, b) => Category.StandardRoles.indexOf(a.name) - Category.StandardRoles.indexOf(b.name)
      );
    }
    this.trigger();
  };
}

export default new CategoryStore();
