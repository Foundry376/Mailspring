import { Contact } from 'mailspring-exports';
import { ContactDetailWithFocus } from '../lib/ContactDetail';
import { Store } from '../lib/Store';

const SAVE = 0;
const DISCARD = 1;
const KEEP_EDITING = 2;

describe('Leaving Contacts while editing a contact', function () {
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
  let detail: any;
  let dialog: jasmine.Spy;

  beforeEach(function () {
    detail = new ContactDetailWithFocus({
      editing: contact.id,
      contacts: [contact],
      focusedId: contact.id,
      perspective: { type: 'all', accountId: TEST_ACCOUNT_ID, label: 'All Contacts' },
      groups: [],
    });
    dialog = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync');
    spyOn(detail, 'onSaveChanges');
    spyOn(Store, 'setEditing');
  });

  const typeCompany = () => {
    detail.state = { ...detail.state, data: { ...detail.state.data, company: 'Acme' } };
  };

  it('leaves without asking when no field has changed', function () {
    expect(detail._mayLeaveSection()).toBe(true);
    expect(dialog).not.toHaveBeenCalled();
  });

  it('stays in Contacts, still editing, on Keep editing', function () {
    typeCompany();
    dialog.andReturn(KEEP_EDITING);
    expect(detail._mayLeaveSection()).toBe(false);
    expect(detail.onSaveChanges).not.toHaveBeenCalled();
    expect(Store.setEditing).not.toHaveBeenCalled();
  });

  it('stops editing without saving on Discard', function () {
    typeCompany();
    dialog.andReturn(DISCARD);
    expect(detail._mayLeaveSection()).toBe(true);
    expect(detail.onSaveChanges).not.toHaveBeenCalled();
    expect(Store.setEditing).toHaveBeenCalledWith(false);
  });

  it('saves the changes on Save Changes', function () {
    typeCompany();
    dialog.andReturn(SAVE);
    expect(detail._mayLeaveSection()).toBe(true);
    expect(detail.onSaveChanges).toHaveBeenCalled();
  });
});
