import React from 'react';
import { Account, AccountStore } from 'mailspring-exports';
import { ContactSource, Store } from './Store';
import {
  ScrollRegion,
  OutlineView,
  OutlineViewItem,
  ListensToFluxStore,
} from 'mailspring-component-kit';

interface ContactSourcesProps {
  accounts: Account[];
  selected: ContactSource | null;
  onSelect: (item: ContactSource | null) => void;
}

const ContactSourcesWithData: React.FunctionComponent<ContactSourcesProps> = ({
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
            id: 'bla',
            name: 'Found in Mail',
            iconName: 'inbox.png',
            selected: selected && selected.accountId == a.id && selected.type === 'mail',
            onSelect: () => onSelect({ accountId: a.id, type: 'mail' }),
            children: [],
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
    selected: Store.selectedGroup(),
    onSelect: s => Store.setSelectedGroup(s),
  }),
});

ContactSources.displayName = 'ContactSources';
ContactSources.containerStyles = {
  minWidth: 165,
  maxWidth: 250,
};
