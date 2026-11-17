import { Actions, Contact, SyncbackContactTask, TaskQueue } from 'mailspring-exports';
import { ContactDetailWithFocus } from '../lib/ContactDetail';
import { Store } from '../lib/Store';

const SAVE = 0;
const DISCARD = 1;
const KEEP_EDITING = 2;

const contact = new Contact({
  id: 'c1',
  accountId: TEST_ACCOUNT_ID,
  name: 'Ana Lopez',
  email: 'ana@example.com',
  source: 'carddav',
  info: {
    vcf: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Lopez\r\nEMAIL:ana@example.com\r\nEND:VCARD\r\n',
    href: '',
  },
});
function editor(editing: string, newContactAccountId: string | null = null): any {
  return new ContactDetailWithFocus({
    editing,
    newContactAccountId,
    contacts: [contact],
    focusedId: contact.id,
    groups: [],
  });
}

function typeCompany(detail: any) {
  detail.state = { ...detail.state, data: { ...detail.state.data, company: 'Acme' } };
}

describe('Leaving Contacts while editing a contact', function () {
  let detail: any;
  let dialog: jasmine.Spy;

  beforeEach(function () {
    detail = editor(contact.id);
    dialog = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync');
    spyOn(detail, 'onSaveChanges');
    spyOn(Store, 'setEditing');
  });

  it('leaves without asking when no field has changed', function () {
    expect(detail._mayLeaveSection()).toBe(true);
    expect(dialog).not.toHaveBeenCalled();
  });

  it('stays in Contacts, still editing, on Keep editing', function () {
    typeCompany(detail);
    dialog.andReturn(KEEP_EDITING);
    expect(detail._mayLeaveSection()).toBe(false);
    expect(detail.onSaveChanges).not.toHaveBeenCalled();
    expect(Store.setEditing).not.toHaveBeenCalled();
  });

  it('stops editing without saving on Discard', function () {
    typeCompany(detail);
    dialog.andReturn(DISCARD);
    expect(detail._mayLeaveSection()).toBe(true);
    expect(detail.onSaveChanges).not.toHaveBeenCalled();
    expect(Store.setEditing).toHaveBeenCalledWith(false);
  });

  it('saves the changes on Save Changes', function () {
    typeCompany(detail);
    dialog.andReturn(SAVE);
    expect(detail._mayLeaveSection()).toBe(true);
    expect(detail.onSaveChanges).toHaveBeenCalled();
  });
});

describe('Saving a contact', function () {
  let queued: jasmine.Spy;

  beforeEach(function () {
    queued = spyOn(Actions, 'queueTask');
    spyOn(Store, 'setEditing');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(new Promise(() => {}));
  });

  it('updates an existing contact in its own account', function () {
    const detail = editor(contact.id);
    typeCompany(detail);
    detail.onSaveChanges();

    const task = queued.mostRecentCall.args[0];
    expect(task instanceof SyncbackContactTask).toBe(true);
    expect(task.accountId).toBe(TEST_ACCOUNT_ID);
    expect(task.contact.id).toBe(contact.id);
    expect(Store.setEditing).toHaveBeenCalledWith(false);
  });

  it('creates a new contact in the account it was started in', function () {
    const detail = editor('new', 'picked-account');
    detail.onSaveChanges();

    const task = queued.mostRecentCall.args[0];
    expect(task instanceof SyncbackContactTask).toBe(true);
    expect(task.accountId).toBe('picked-account');
    expect(task.contact.id).toBeFalsy();
  });
});

describe('A new contact whose account is changed while its form is open', function () {
  it('is rebuilt for the newly picked account', function () {
    const detail = editor('new', 'first-account');
    detail.setState = (changes) => (detail.state = { ...detail.state, ...changes });
    const prevProps = detail.props;
    detail.props = { ...prevProps, newContactAccountId: 'second-account' };
    detail.componentDidUpdate(prevProps);

    expect(detail.state.contact.accountId).toBe('second-account');
  });
});

describe('Clicking another contact while editing one', function () {
  it('keeps the typed changes and the edited contact on Keep editing', function () {
    const other = new Contact({ ...contact, id: 'c2', name: 'Ben Ito' });
    const detail: any = new ContactDetailWithFocus({
      editing: contact.id,
      newContactAccountId: null,
      contacts: [contact, other],
      focusedId: contact.id,
      groups: [],
    });
    detail.setState = (changes) => (detail.state = { ...detail.state, ...changes });
    const moveFocus = (focusedId: string) => {
      const prevProps = detail.props;
      detail.props = { ...prevProps, focusedId };
      detail.componentDidUpdate(prevProps);
    };
    typeCompany(detail);
    spyOn(require('@electron/remote').dialog, 'showMessageBoxSync').andReturn(KEEP_EDITING);
    spyOn(Actions, 'setFocus');
    spyOn(Store, 'setEditing');

    moveFocus(other.id);
    expect(Actions.setFocus).toHaveBeenCalledWith({ collection: 'contact', item: contact });
    moveFocus(contact.id);

    expect(Store.setEditing).not.toHaveBeenCalled();
    expect(detail.state.data.company).toBe('Acme');
  });
});
