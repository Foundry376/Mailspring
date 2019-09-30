import { WorkspaceStore, ComponentRegistry, Actions } from 'mailspring-exports';
import { ContactPerspectivesList } from './ContactPerspectivesList';
import { ContactDetailToolbar } from './ContactDetailToolbar';
import { ContactList, ContactListSearch } from './ContactList';
import { ContactDetail } from './ContactDetail';
import { FoundInMailEnabledBar } from './FoundInMailEnabledBar';

export function activate() {
  WorkspaceStore.defineSheet(
    'Contacts',
    { root: true },
    { split: ['ContactsSidebar', 'ContactsList', 'ContactsDetail'] }
  );

  Actions.selectRootSheet(WorkspaceStore.Sheet.Contacts);

  ComponentRegistry.register(ContactPerspectivesList, {
    location: WorkspaceStore.Location.ContactsSidebar,
  });
  ComponentRegistry.register(FoundInMailEnabledBar, {
    location: WorkspaceStore.Location.ContactsList,
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
  ComponentRegistry.register(ContactDetailToolbar, {
    location: WorkspaceStore.Location.ContactsDetail.Toolbar,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ContactPerspectivesList);
  ComponentRegistry.unregister(ContactList);
  ComponentRegistry.unregister(FoundInMailEnabledBar);
  ComponentRegistry.unregister(ContactListSearch);
  ComponentRegistry.unregister(ContactDetail);
  ComponentRegistry.unregister(ContactDetailToolbar);
}
