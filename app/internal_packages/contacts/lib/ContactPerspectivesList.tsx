import React from 'react';
import {
  Account,
  AccountStore,
  ContactGroup,
  ContactBook,
  Rx,
  Actions,
  DestroyContactGroupTask,
  SyncbackContactGroupTask,
  ChangeContactGroupMembershipTask,
  localized,
} from 'mailspring-exports';
import {
  ContactsPerspective,
  Store,
  ContactsPerspectiveForGroup,
  ContactsPerspectiveForLocalGroup,
  ContactsPerspectiveForLocalAll,
} from './Store';
import {
  ScrollRegion,
  OutlineView,
  OutlineViewItem,
  ListensToFluxStore,
  ListensToObservable,
  IOutlineViewItem,
} from 'mailspring-component-kit';
import { isEqual } from 'underscore';
import { showGPeopleReadonlyNotice } from './GoogleSupport';

interface ContactsPerspectivesProps {
  accounts: Account[];
  groups: ContactGroup[];
  books: ContactBook[];
  localGroups: LocalGroup[];
  findInMailDisabled: string[];
  selected: ContactsPerspective;
  onSelect: (item: ContactsPerspective) => void;
}

type LocalGroup = {
  id: string;
  name: string;
};

const LOCAL_GROUPS_KEY = 'core.contacts.localGroups';
const LOCAL_GROUP_MEMBERS_KEY = 'core.contacts.localGroupMembers';

function localGroupsFromConfig(): LocalGroup[] {
  return AppEnv.config.get(LOCAL_GROUPS_KEY) || [];
}

function setLocalGroups(groups: LocalGroup[]) {
  AppEnv.config.set(LOCAL_GROUPS_KEY, groups);
}

function localGroupMembersFromConfig(): { [groupId: string]: string[] } {
  return AppEnv.config.get(LOCAL_GROUP_MEMBERS_KEY) || {};
}

function setLocalGroupMembers(members: { [groupId: string]: string[] }) {
  AppEnv.config.set(LOCAL_GROUP_MEMBERS_KEY, members);
}

function nextDefaultLocalGroupName(groups: LocalGroup[]) {
  const base = localized('New Group');
  const existing = new Set(groups.map(g => (g.name || '').trim().toLowerCase()));
  if (!existing.has(base.toLowerCase())) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

function perspectiveForLocalGroup(g: LocalGroup): ContactsPerspectiveForLocalGroup {
  return {
    type: 'local-group',
    groupId: g.id,
    label: g.name,
  };
}

function perspectiveForLocalAll(): ContactsPerspectiveForLocalAll {
  return {
    type: 'local-all',
    label: localized('All Local Contacts'),
  };
}

function perspectiveForGroup(g: ContactGroup): ContactsPerspectiveForGroup {
  return {
    accountId: g.accountId,
    type: 'group',
    groupId: g.id,
    label: g.name,
  };
}

interface OutlineViewForAccountProps {
  account: Account;
  groups: ContactGroup[];
  books: ContactBook[];
  findInMailDisabled: boolean;
  selected: ContactsPerspective | null;
  onSelect: (item: ContactsPerspective) => void;
}

const OutlineViewForAccount = ({
  account,
  groups,
  books,
  selected,
  onSelect,
  findInMailDisabled,
}: OutlineViewForAccountProps) => {
  const items: IOutlineViewItem[] = [];

  if (books.length) {
    items.push({
      id: 'all-contacts',
      name: localized('All Contacts'),
      iconName: 'person.png',
      children: [],
      selected: selected && selected.type === 'all',
      onSelect: () =>
        onSelect({ accountId: account.id, type: 'all', label: localized('All Contacts') }),
      shouldAcceptDrop: () => false,
    });

    for (const group of groups) {
      const perspective = perspectiveForGroup(group);
      items.push({
        id: `${perspective.accountId}-${perspective.label}`,
        name: perspective.label,
        iconName: 'label.png',
        children: [],
        selected: isEqual(selected, perspective),
        onSelect: () => onSelect(perspective),
        onEdited: (item, value: string) => {
          if (showGPeopleReadonlyNotice(account.id)) {
            return false;
          }
          Actions.queueTask(SyncbackContactGroupTask.forRenaming(group, value));
        },
        onDelete: () => {
          if (showGPeopleReadonlyNotice(account.id)) {
            return false;
          }
          Actions.queueTask(DestroyContactGroupTask.forRemoving(group));
        },
        onDrop: (item, { dataTransfer }) => {
          const data = JSON.parse(dataTransfer.getData('mailspring-contacts-data'));
          const contacts = data.ids.map(i => Store.filteredContacts().find(c => c.id === i));
          if (!contacts.length) {
            return false;
          }
          if (showGPeopleReadonlyNotice(contacts[0].accountId)) {
            return false;
          }
          Actions.queueTask(
            ChangeContactGroupMembershipTask.forMoving({
              direction: 'add',
              contacts,
              group,
            })
          );
        },
        shouldAcceptDrop: (item, { dataTransfer }) => {
          if (!dataTransfer.types.includes('mailspring-contacts-data')) {
            return false;
          }
          if (isEqual(selected, perspective)) {
            return false;
          }
          // We can't inspect the drag payload until drop, so we use a dataTransfer
          // type to encode the account IDs of threads currently being dragged.
          const accountsType = dataTransfer.types.find(t => t.startsWith('mailspring-accounts='));
          const accountIds = (accountsType || '').replace('mailspring-accounts=', '').split(',');

          return isEqual(accountIds, [perspective.accountId]);
        },
      });
    }
  }

  items.push({
    id: 'found-in-mail',
    name: localized('Found in Mail'),
    iconName: 'inbox.png',
    children: [],
    className: findInMailDisabled ? 'found-in-mail-disabled' : '',
    selected: selected && selected.type === 'found-in-mail',
    shouldAcceptDrop: () => false,
    onSelect: () =>
      onSelect({
        accountId: account.id,
        type: 'found-in-mail',
        label: `${localized('Found in Mail')} (${account.label})`,
      }),
  });

  return (
    <OutlineView
      title={account.label}
      items={items}
      onItemCreated={
        books.length > 0
          ? name => {
              if (showGPeopleReadonlyNotice(account.id)) {
                return false;
              }
              Actions.queueTask(SyncbackContactGroupTask.forCreating(account.id, name));
            }
          : undefined
      }
    />
  );
};

const ContactsPerspectivesWithData: React.FunctionComponent<ContactsPerspectivesProps> = ({
  findInMailDisabled,
  groups,
  localGroups,
  books,
  accounts,
  selected,
  onSelect,
}) => {
  const selectedRemoteGroup =
    selected.type === 'group' ? groups.find(g => g.id === selected.groupId) : null;
  const selectedLocalGroup =
    selected.type === 'local-group' ? localGroups.find(g => g.id === selected.groupId) : null;

  const localItems: IOutlineViewItem[] = [
    {
      id: 'local-all-contacts',
      name: localized('All Local Contacts'),
      iconName: 'person.png',
      children: [],
      selected: selected.type === 'local-all',
      onSelect: () => onSelect(perspectiveForLocalAll()),
      shouldAcceptDrop: () => false,
    },
    ...localGroups.map(group => {
      const perspective = perspectiveForLocalGroup(group);
      return {
        id: `local-${group.id}`,
        name: group.name,
        iconName: 'label.png',
        children: [],
        selected: selected.type === 'local-group' && selected.groupId === group.id,
        onSelect: () => onSelect(perspective),
        onEdited: (item, value: string) => {
          const trimmed = (value || '').trim();
          if (!trimmed) {
            return false;
          }
          const updated = localGroups.map(g => (g.id === group.id ? { ...g, name: trimmed } : g));
          setLocalGroups(updated);
          if (selected.type === 'local-group' && selected.groupId === group.id) {
            onSelect({ type: 'local-group', groupId: group.id, label: trimmed });
          }
        },
        onDelete: () => {
          const nextGroups = localGroups.filter(g => g.id !== group.id);
          setLocalGroups(nextGroups);
          const members = localGroupMembersFromConfig();
          delete members[group.id];
          setLocalGroupMembers(members);
          if (selected.type === 'local-group' && selected.groupId === group.id) {
            onSelect({ type: 'unified' });
          }
        },
        onDrop: (item, { dataTransfer }) => {
          const data = JSON.parse(dataTransfer.getData('mailspring-contacts-data'));
          const members = localGroupMembersFromConfig();
          const existing = new Set(members[group.id] || []);
          for (const id of data.ids || []) {
            existing.add(id);
          }
          members[group.id] = Array.from(existing);
          setLocalGroupMembers(members);
          if (selected.type === 'local-group' && selected.groupId === group.id) {
            Store.repopulate();
          }
        },
        shouldAcceptDrop: (item, { dataTransfer }) => {
          if (!dataTransfer.types.includes('mailspring-contacts-data')) {
            return false;
          }
          return !(selected.type === 'local-group' && selected.groupId === group.id);
        },
      };
    }),
  ];

  return (
    <div className="contacts-perspective-column">
      <ScrollRegion style={{ flex: 1 }} className="contacts-perspective-list">
        <section className="outline-view nylas-outline-view" style={{ paddingTop: 15 }}>
          <OutlineViewItem
            item={{
              id: 'bla',
              name: 'All Contacts',
              iconName: 'people.png',
              children: [],
              selected: selected.type === 'unified',
              onSelect: () => onSelect({ type: 'unified' }),
            }}
          />
        </section>
        <OutlineView title={localized('Local Contacts')} items={localItems} />
        {accounts.map(a => (
          <OutlineViewForAccount
            key={a.id}
            account={a}
            findInMailDisabled={findInMailDisabled.includes(a.id)}
            books={books.filter(b => b.accountId === a.id)}
            groups={groups.filter(b => b.accountId === a.id)}
            selected={'accountId' in selected && selected.accountId === a.id ? selected : null}
            onSelect={onSelect}
          />
        ))}
      </ScrollRegion>
      <div className="contacts-group-actions">
        <button
          className="btn btn-toolbar btn-group-action"
          title={localized('Create local group')}
          disabled={false}
          onClick={() => {
            const current = localGroupsFromConfig();
            const next = {
              id: `local-group-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
              name: nextDefaultLocalGroupName(current),
            };
            setLocalGroups([...current, next]);
            onSelect({ type: 'local-group', groupId: next.id, label: next.name });
          }}
        >
          +
        </button>
        <button
          className={`btn btn-toolbar btn-group-action ${
            !selectedRemoteGroup && !selectedLocalGroup ? 'btn-disabled' : ''
          }`}
          title={
            selectedRemoteGroup
              ? localized('Delete group %@', selectedRemoteGroup.name)
              : selectedLocalGroup
              ? localized('Delete group %@', selectedLocalGroup.name)
              : localized('Select a group to delete it.')
          }
          disabled={!selectedRemoteGroup && !selectedLocalGroup}
          onClick={() => {
            if (selectedLocalGroup) {
              const nextGroups = localGroups.filter(g => g.id !== selectedLocalGroup.id);
              setLocalGroups(nextGroups);
              const members = localGroupMembersFromConfig();
              delete members[selectedLocalGroup.id];
              setLocalGroupMembers(members);
              onSelect({ type: 'unified' });
              return;
            }
            if (!selectedRemoteGroup) {
              return;
            }
            if (showGPeopleReadonlyNotice(selectedRemoteGroup.accountId)) {
              return;
            }
            Actions.queueTask(DestroyContactGroupTask.forRemoving(selectedRemoteGroup));
          }}
        >
          -
        </button>
      </div>
    </div>
  );
};

export const ContactPerspectivesList = ListensToObservable(
  ListensToFluxStore(ContactsPerspectivesWithData, {
    stores: [AccountStore, Store],
    getStateFromStores: () => ({
      accounts: AccountStore.accounts(),
      books: Store.books(),
      groups: Store.groups(),
      selected: Store.perspective(),
      onSelect: s => Store.setPerspective(s),
    }),
  }),
  {
    getObservable: () =>
      Rx.Observable.merge(
        Rx.Observable.fromConfig('core.contacts.findInMailDisabled'),
        Rx.Observable.fromConfig(LOCAL_GROUPS_KEY),
        Rx.Observable.fromConfig(LOCAL_GROUP_MEMBERS_KEY)
      ),
    getStateFromObservable: () => ({
      findInMailDisabled: AppEnv.config.get('core.contacts.findInMailDisabled'),
      localGroups: localGroupsFromConfig(),
    }),
  }
);

ContactPerspectivesList.displayName = 'ContactPerspectivesList';
ContactPerspectivesList.containerStyles = {
  minWidth: 165,
  maxWidth: 250,
};
