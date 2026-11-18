import { Actions, Contact, WorkspaceStore } from 'mailspring-exports';
import { ContactListContextMenu } from '../lib/ContactListContextMenu';
import { Store } from '../lib/Store';

describe("Edit in a contact's context menu", function () {
  const contact = new Contact({ id: 'c2', accountId: 'carddav-account', source: 'carddav' } as any);
  let removeGuard: () => void;
  const clickEdit = () =>
    (new ContactListContextMenu([contact]).editItem() as { click: () => void }).click();

  beforeEach(function () {
    spyOn(Store, 'setEditing');
    spyOn(Actions, 'setFocus');
  });

  afterEach(function () {
    removeGuard();
  });

  it('opens that contact for editing', function () {
    removeGuard = WorkspaceStore.setSectionLeaveGuard(() => true);
    clickEdit();
    expect(Actions.setFocus).toHaveBeenCalledWith({ collection: 'contact', item: contact });
    expect(Store.setEditing).toHaveBeenCalledWith(contact.id);
  });

  it('leaves the open edit alone when the user keeps editing', function () {
    removeGuard = WorkspaceStore.setSectionLeaveGuard(() => false);
    clickEdit();
    expect(Store.setEditing).not.toHaveBeenCalled();
    expect(Actions.setFocus).not.toHaveBeenCalled();
  });
});
