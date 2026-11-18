import { Account, AccountStore, Actions, ContactBook, WorkspaceStore } from 'mailspring-exports';
import { accountForNewContact, startNewContact } from '../lib/AddContactToolbar';
import { Store } from '../lib/Store';

const work = new Account({ id: 'work', label: 'Work' } as any);
const home = new Account({ id: 'home', label: 'Home' } as any);

describe('The accounts New Contact offers', function () {
  let books: ContactBook[];

  beforeEach(function () {
    books = Store._books;
    spyOn(AccountStore, 'accounts').andReturn([work, home]);
  });

  afterEach(function () {
    Store._books = books;
  });

  it('are only those with an address book', function () {
    Store._books = [new ContactBook({ id: 'book', accountId: work.id, source: 'carddav' } as any)];
    expect(Store.accountsWithContactBooks()).toEqual([work]);
  });
});

describe('The account New Contact uses without asking', function () {
  it('is the account whose contacts are shown', function () {
    const perspective = { type: 'all' as const, accountId: home.id, label: 'Contacts' };
    expect(accountForNewContact(perspective, [work, home])).toBe(home);
  });

  it('is the account whose Found in Mail is shown, when it has an address book', function () {
    const perspective = { type: 'found-in-mail' as const, accountId: home.id, label: 'Found' };
    expect(accountForNewContact(perspective, [work, home])).toBe(home);
  });

  it('is the only account with an address book', function () {
    expect(accountForNewContact({ type: 'unified' }, [work])).toBe(work);
  });

  it('is none under All Contacts with several accounts, so the user picks one', function () {
    expect(accountForNewContact({ type: 'unified' }, [work, home])).toBe(null);
  });

  it('is none in Found in Mail of an account with no address book', function () {
    const perspective = { type: 'found-in-mail' as const, accountId: 'mail-only', label: 'Found' };
    expect(accountForNewContact(perspective, [work, home])).toBe(null);
  });
});

describe('Starting a new contact', function () {
  let removeGuard: () => void;

  beforeEach(function () {
    spyOn(Store, 'startNewContact');
    spyOn(Actions, 'setFocus');
  });

  afterEach(function () {
    removeGuard?.();
  });

  it('opens the form for the picked account', function () {
    removeGuard = WorkspaceStore.setSectionLeaveGuard(() => true);
    startNewContact(home.id);
    expect(Store.startNewContact).toHaveBeenCalledWith(home.id);
  });

  it('leaves the open edit alone when the user keeps editing', function () {
    removeGuard = WorkspaceStore.setSectionLeaveGuard(() => false);
    startNewContact(home.id);
    expect(Store.startNewContact).not.toHaveBeenCalled();
    expect(Actions.setFocus).not.toHaveBeenCalled();
  });
});
