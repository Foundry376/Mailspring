import { WorkspaceStore, ComponentRegistry, Actions, localized } from 'mailspring-exports';
import { ContactPerspectivesList } from './ContactPerspectivesList';
import { ContactDetailToolbar } from './ContactDetailToolbar';
import { AddContactToolbar } from './AddContactToolbar';
import { ContactList, ContactListSearch } from './ContactList';
import { ContactDetail } from './ContactDetail';
import { FoundInMailEnabledBar } from './FoundInMailEnabledBar';

function adjustMenus() {
  const contactMenu: typeof AppEnv.menu.template[0] = {
    key: 'Contact',
    label: localized('Contact'),
    submenu: [
      {
        label: localized('New Contact'),
        command: 'core:add-item',
      },
      { type: 'separator' },
      {
        label: localized('Edit Contact'),
        command: 'core:edit-item',
      },
      {
        label: localized('Delete Contact'),
        command: 'core:delete-item',
      },
      { type: 'separator' },
      {
        label: localized('Remove from Group'),
        command: 'core:remove-from-view',
      },
    ],
  };

  const template = AppEnv.menu.template.filter(
    item => item.key !== 'Thread' && item.key !== 'View'
  );
  const editIndex = template.findIndex(item => item.key === 'Edit');
  template.splice(editIndex + 1, 0, contactMenu);

  AppEnv.menu.template = template;
  AppEnv.menu.update();
}

export function activate() {
  WorkspaceStore.defineSheet(
    'Contacts',
    { root: true },
    { split: ['ContactsSidebar', 'ContactsList', 'ContactsDetail'] }
  );

  adjustMenus();
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
  ComponentRegistry.register(AddContactToolbar, {
    location: WorkspaceStore.Location.ContactsSidebar.Toolbar,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ContactPerspectivesList);
  ComponentRegistry.unregister(ContactList);
  ComponentRegistry.unregister(FoundInMailEnabledBar);
  ComponentRegistry.unregister(ContactListSearch);
  ComponentRegistry.unregister(ContactDetail);
  ComponentRegistry.unregister(ContactDetailToolbar);
  ComponentRegistry.unregister(AddContactToolbar);
}
