import React from 'react';
import {
  Account,
  AccountStore,
  ContactGroup,
  Rx,
  Actions,
  DestroyContactGroupTask,
  SyncbackContactGroupTask,
  ChangeContactGroupMembershipTask,
} from 'mailspring-exports';
import { ContactsPerspective, Store } from './Store';
import {
  ScrollRegion,
  OutlineView,
  OutlineViewItem,
  ListensToFluxStore,
  ListensToObservable,
} from 'mailspring-component-kit';
import { isEqual } from 'underscore';

interface ContactsPerspectivesProps {
  accounts: Account[];
  groups: ContactGroup[];
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

const ContactsPerspectivesWithData: React.FunctionComponent<ContactsPerspectivesProps> = ({
  findInMailDisabled,
  groups,
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
      <OutlineView
        key={a.id}
        title={a.label}
        onItemCreated={name => Actions.queueTask(SyncbackContactGroupTask.forCreating(a.id, name))}
        items={[
          {
            id: 'all-contacts',
            name: 'All Contacts',
            iconName: 'person.png',
            children: [],
            selected: selected && selected.accountId == a.id && selected.type === 'all',
            onSelect: () => onSelect({ accountId: a.id, type: 'all', label: 'All Contacts' }),
            shouldAcceptDrop: () => false,
          },
          ...groups
            .filter(g => g.accountId === a.id)
            .map(group => {
              const perspective = perspectiveForGroup(group);
              return {
                id: `${perspective.accountId}-${perspective.label}`,
                name: perspective.label,
                iconName: 'label.png',
                children: [],
                selected: isEqual(selected, perspective),
                onSelect: () => onSelect(perspective),
                onEdited: (item, value: string) => {
                  Actions.queueTask(SyncbackContactGroupTask.forRenaming(group, value));
                },
                onDelete: () => {
                  Actions.queueTask(DestroyContactGroupTask.forRemoving(group));
                },
                onDrop: (item, { dataTransfer }) => {
                  const data = JSON.parse(dataTransfer.getData('mailspring-contacts-data'));
                  const contacts = data.ids.map(i =>
                    Store.filteredContacts().find(c => c.id === i)
                  );
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
                  const accountsType = dataTransfer.types.find(t =>
                    t.startsWith('mailspring-accounts=')
                  );
                  const accountIds = (accountsType || '')
                    .replace('mailspring-accounts=', '')
                    .split(',');

                  return isEqual(accountIds, [perspective.accountId]);
                },
              };
            }),
          {
            id: 'found-in-mail',
            name: 'Found in Mail',
            iconName: 'inbox.png',
            children: [],
            className: findInMailDisabled.includes(a.id) ? 'found-in-mail-disabled' : '',
            selected: selected && selected.accountId == a.id && selected.type === 'found-in-mail',
            shouldAcceptDrop: () => false,
            onSelect: () =>
              onSelect({
                accountId: a.id,
                type: 'found-in-mail',
                label: `Found in Mail (${a.label})`,
              }),
          },
        ]}
      />
    ))}
  </ScrollRegion>
);

export const ContactPerspectivesList = ListensToObservable(
  ListensToFluxStore(ContactsPerspectivesWithData, {
    stores: [AccountStore, Store],
    getStateFromStores: () => ({
      accounts: AccountStore.accounts(),
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
