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
import { ContactsPerspective, Store } from './Store';
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
  findInMailDisabled: string[];
  selected: ContactsPerspective | null;
  onSelect: (item: ContactsPerspective | null) => void;
}

function perspectiveForGroup(g: ContactGroup): ContactsPerspective {
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
  onSelect: (item: ContactsPerspective | null) => void;
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
  books,
  accounts,
  selected,
  onSelect,
}) => (
  <ScrollRegion style={{ flex: 1 }} className="contacts-perspective-list">
    <section className="outline-view" style={{ paddingTop: 15 }}>
      <OutlineViewItem
        item={{
          id: 'bla',
          name: 'All Contacts',
          iconName: 'people.png',
          children: [],
          selected: selected === null,
          onSelect: () => onSelect(null),
        }}
      />
    </section>
    {accounts.map(a => (
      <OutlineViewForAccount
        key={a.id}
        account={a}
        findInMailDisabled={findInMailDisabled.includes(a.id)}
        books={books.filter(b => b.accountId === a.id)}
        groups={groups.filter(b => b.accountId === a.id)}
        selected={selected && selected.accountId === a.id ? selected : null}
        onSelect={onSelect}
      />
    ))}
  </ScrollRegion>
);

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
    getObservable: () => Rx.Observable.fromConfig('core.contacts.findInMailDisabled'),
    getStateFromObservable: () => ({
      findInMailDisabled: AppEnv.config.get('core.contacts.findInMailDisabled'),
    }),
  }
);

ContactPerspectivesList.displayName = 'ContactPerspectivesList';
ContactPerspectivesList.containerStyles = {
  minWidth: 165,
  maxWidth: 250,
};
