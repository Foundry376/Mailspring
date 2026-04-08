import _ from 'underscore';
import {
  localized,
  Contact,
  ContactGroup,
  Actions,
  ChangeContactGroupMembershipTask,
} from 'mailspring-exports';
import { Store } from './Store';
import { exportContactsToFile } from './VCFImportExport';
import { showGPeopleReadonlyNotice } from './GoogleSupport';

type ClickItem = {
  label: string;
  click?: () => void;
  enabled?: boolean;
  submenu?: ClickItem[];
};
type TemplateItem = ClickItem | { type: 'separator' };

export class ContactListContextMenu {
  contacts: Contact[];

  constructor(contacts: Contact[]) {
    this.contacts = contacts;
  }

  editItem(): TemplateItem | null {
    if (this.contacts.length !== 1) return null;
    const contact = this.contacts[0];
    if (contact.source === 'mail') return null;
    return {
      label: localized('Edit'),
      click: () => {
        if (showGPeopleReadonlyNotice(contact.accountId)) return;
        Store.setEditing(contact.id);
      },
    };
  }

  exportItem(): TemplateItem {
    const count = this.contacts.length;
    return {
      label:
        count === 1
          ? localized('Export vCard...')
          : localized('Export %@ vCards...', String(count)),
      click: () => exportContactsToFile(this.contacts),
    };
  }

  groupsForSelection(): ContactGroup[] {
    const accountIds = _.uniq(this.contacts.map(c => c.accountId));
    if (accountIds.length !== 1) return [];
    return Store.groups()
      .filter(g => g.accountId === accountIds[0])
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  addToGroupItem(): TemplateItem | null {
    const groups = this.groupsForSelection();
    if (groups.length === 0) return null;

    const submenu: ClickItem[] = groups.map(group => {
      const contactsToAdd = this.contacts.filter(c => !c.contactGroups.includes(group.id));
      return {
        label: group.name,
        enabled: contactsToAdd.length > 0,
        click: () => {
          if (showGPeopleReadonlyNotice(group.accountId)) return;
          if (contactsToAdd.length === 0) return;
          Actions.queueTask(
            ChangeContactGroupMembershipTask.forMoving({
              direction: 'add',
              contacts: contactsToAdd,
              group,
            })
          );
        },
      };
    });

    return {
      label: localized('Add to Group'),
      submenu,
    };
  }

  removeFromGroupItem(): TemplateItem | null {
    const groups = this.groupsForSelection();
    if (groups.length === 0) return null;

    const submenu: ClickItem[] = groups.map(group => {
      const contactsToRemove = this.contacts.filter(c => c.contactGroups.includes(group.id));
      return {
        label: group.name,
        enabled: contactsToRemove.length > 0,
        click: () => {
          if (showGPeopleReadonlyNotice(group.accountId)) return;
          if (contactsToRemove.length === 0) return;
          Actions.queueTask(
            ChangeContactGroupMembershipTask.forMoving({
              direction: 'remove',
              contacts: contactsToRemove,
              group,
            })
          );
        },
      };
    });

    const hasAnyMembership = submenu.some(item => item.enabled);
    if (!hasAnyMembership) return null;

    return {
      label: localized('Remove from Group'),
      submenu,
    };
  }

  template(): TemplateItem[] {
    const items: (TemplateItem | null)[] = [
      this.editItem(),
      this.addToGroupItem(),
      this.removeFromGroupItem(),
      { type: 'separator' },
      this.exportItem(),
    ];

    // Drop nulls, then strip any separators at the leading or trailing edges.
    return _.compact(items).filter((item, idx, arr) => {
      if ((item as any).type !== 'separator') return true;
      return idx !== 0 && idx !== arr.length - 1;
    });
  }

  displayMenu() {
    require('@electron/remote')
      .Menu.buildFromTemplate(this.template())
      .popup({});
  }
}
