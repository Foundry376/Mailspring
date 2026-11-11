import { ipcRenderer } from 'electron';
import {
  WorkspaceStore,
  ComponentRegistry,
  Actions,
  AccountStore,
  localized,
} from 'mailspring-exports';
import { ContactPerspectivesList } from './ContactPerspectivesList';
import { ContactDetailToolbar } from './ContactDetailToolbar';
import { AddContactToolbar } from './AddContactToolbar';
import { ContactList, ContactListSearch } from './ContactList';
import { ContactDetail } from './ContactDetail';
import { FoundInMailEnabledBar } from './FoundInMailEnabledBar';
import { Store } from './Store';
import { exportContactsToFile, importContactsFromFile } from './VCFImportExport';

const contactMenu: (typeof AppEnv.menu.template)[0] = {
  id: 'Contact',
  label: localized('Contact'),
  submenu: [
    {
      label: localized('New Contact'),
      command: 'core:add-item',
    },
    { type: 'separator' },
    {
      label: localized('Import vCards...'),
      command: 'contacts:import-vcf',
    },
    {
      label: localized('Export All vCards...'),
      command: 'contacts:export-vcf-all',
    },
    {
      label: localized('Export Selected...'),
      command: 'contacts:export-vcf-selected',
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

// Sent by the main process for application:show-contacts, from the Window menu or Preferences.
function onShowContacts() {
  if (WorkspaceStore.rootSheet() !== WorkspaceStore.Sheet.Contacts) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Contacts);
  }
}

function startStoreWhenShowing() {
  if (WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Contacts) Store.start();
}

let _commandDisposable: { dispose: () => void } | null = null;
let _unlistenWorkspace: (() => void) | null = null;

function resolveImportAccountId(): string | null {
  const perspective = Store.perspective();
  if ('accountId' in perspective) {
    return perspective.accountId;
  }
  // Unified view — fall back to the first CardDAV-capable account.
  const account = AccountStore.accounts().find((a) => a.provider !== 'gmail');
  return account ? account.id : null;
}

export function activate() {
  WorkspaceStore.defineSheet(
    'Contacts',
    { root: true, menu: contactMenu },
    { split: ['ContactsSidebar', 'ContactsList', 'ContactsDetail'] }
  );
  _unlistenWorkspace = WorkspaceStore.listen(startStoreWhenShowing);
  ipcRenderer.on('show-contacts', onShowContacts);

  _commandDisposable = AppEnv.commands.add(document.body, {
    'contacts:import-vcf': () => {
      const accountId = resolveImportAccountId();
      if (accountId) {
        importContactsFromFile(accountId);
      } else {
        require('@electron/remote').dialog.showMessageBox({
          type: 'info',
          title: localized('No Compatible Account'),
          message: localized(
            'VCard import requires at least one CardDAV account. Google accounts must be managed via contacts.google.com.'
          ),
          buttons: [localized('OK')],
        });
      }
    },
    'contacts:export-vcf-all': () => {
      const contacts = Store.filteredContacts() || [];
      exportContactsToFile(contacts);
    },
  });

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
  _commandDisposable?.dispose();
  _commandDisposable = null;
  _unlistenWorkspace?.();
  _unlistenWorkspace = null;
  ipcRenderer.removeListener('show-contacts', onShowContacts);
}
