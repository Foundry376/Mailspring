import { WorkspaceStore, ComponentRegistry, Actions } from 'mailspring-exports';
import { ContactSources } from './ContactSources';
import { ContactList, ContactListSearch } from './ContactList';
import { ContactDetail } from './ContactDetail';

export function activate() {
  WorkspaceStore.defineSheet(
    'Contacts',
    { root: true },
    { split: ['ContactsSidebar', 'ContactsList', 'ContactsDetail'] }
  );

  Actions.selectRootSheet(WorkspaceStore.Sheet.Contacts);

  ComponentRegistry.register(ContactSources, {
    location: WorkspaceStore.Location.ContactsSidebar,
  });
  ComponentRegistry.register(ContactList, {
    location: WorkspaceStore.Location.ContactsList,
  });
  ComponentRegistry.register(ContactListSearch, {
    location: WorkspaceStore.Location.ContactsList.Toolbar,
  });
  ComponentRegistry.register(ContactDetail, {
    location: WorkspaceStore.Location.ContactsDetail,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ContactSources);
  ComponentRegistry.unregister(ContactList);
  ComponentRegistry.unregister(ContactListSearch);
  ComponentRegistry.unregister(ContactDetail);
}
