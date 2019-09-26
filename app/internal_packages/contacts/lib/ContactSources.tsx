import React from 'react';
import { Account, AccountStore, ContactGroup } from 'mailspring-exports';
import { ContactSource, Store } from './Store';
import {
  ScrollRegion,
  OutlineView,
  OutlineViewItem,
  ListensToFluxStore,
} from 'mailspring-component-kit';
import { isEqual } from 'underscore';

interface ContactSourcesProps {
  accounts: Account[];
  groups: ContactGroup[];
  selected: ContactSource | null;
  onSelect: (item: ContactSource | null) => void;
}

function sourceForGroup(g: ContactGroup): ContactSource {
  return {
    accountId: g.accountId,
    type: 'group',
    groupId: g.id,
    label: g.name,
  };
}

const ContactSourcesWithData: React.FunctionComponent<ContactSourcesProps> = ({
  groups,
  accounts,
  selected,
  onSelect,
}) => (
  <ScrollRegion style={{ flex: 1 }} className="contacts-source-list">
    <section className="nylas-outline-view" style={{ paddingTop: 15 }}>
      <OutlineViewItem
        item={{
          id: 'bla',
          name: 'All Contacts',
          iconName: '',
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
        items={[
          {
            id: 'all-contacts',
            name: 'All Contacts',
            children: [],
            selected: selected && selected.accountId == a.id && selected.type === 'all',
            onSelect: () => onSelect({ accountId: a.id, type: 'all', label: 'All Contacts' }),
            shouldAcceptDrop: () => false,
          },
          ...groups
            .filter(g => g.accountId === a.id)
            .map(sourceForGroup)
            .map(source => ({
              id: `${source.accountId}-${source.label}`,
              name: source.label,
              iconName: 'label.png',
              children: [],
              selected: isEqual(selected, source),
              onSelect: () => onSelect(source),
              onDrop: (item, { dataTransfer }) => {
                const data = JSON.parse(dataTransfer.getData('mailspring-contacts-data'));
                // ChangeContactGroupMembershipTask()
              },
              shouldAcceptDrop: (item, { dataTransfer }) => {
                if (!dataTransfer.types.includes('mailspring-contacts-data')) {
                  return false;
                }
                if (isEqual(selected, source)) {
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

                return isEqual(accountIds, [source.accountId]);
              },
            })),
          {
            id: 'found-in-mail',
            name: 'Found in Mail',
            iconName: 'inbox.png',
            children: [],
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

export const ContactSources = ListensToFluxStore(ContactSourcesWithData, {
  stores: [AccountStore, Store],
  getStateFromStores: () => ({
    accounts: AccountStore.accounts(),
    groups: Store.groups(),
    selected: Store.selectedSource(),
    onSelect: s => Store.setSelectedSource(s),
  }),
});

ContactSources.displayName = 'ContactSources';
ContactSources.containerStyles = {
  minWidth: 165,
  maxWidth: 250,
};
