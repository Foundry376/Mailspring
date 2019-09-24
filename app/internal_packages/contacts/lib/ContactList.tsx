import React from 'react';
import { Contact, AccountStore, localized } from 'mailspring-exports';
import {
  FocusContainer,
  MultiselectList,
  ListTabular,
  RetinaImg,
  ListensToFluxStore,
} from 'mailspring-component-kit';
import { ContactSource, Store } from './Store';

const ContactColumn = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: (contact: Contact) => {
    // until we revisit the UI to accommodate more icons
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="subject" dir="auto">
          {contact.name}
        </div>
      </div>
    );
  },
});

class ContactsListEmpty extends React.Component<{ visible: boolean }> {
  render() {
    return this.props.visible ? <div>No contacts to display</div> : <span />;
  }
}

interface ContactListProps {
  search: string;
  contacts: Contact[];
  selectedGroup: ContactSource;
}

class ContactListWithData extends React.Component<ContactListProps> {
  _source = new ListTabular.DataSource.DumbArrayDataSource<Contact>();
  _searchEl = React.createRef<HTMLInputElement>();

  componentDidMount() {
    this.populateDataSource();
  }

  componentDidUpdate(prevProps: ContactListProps) {
    if (this.props.contacts !== prevProps.contacts || this.props.search !== prevProps.search) {
      this.populateDataSource();
    }
  }

  populateDataSource() {
    this._source.setItems(this.props.contacts);
  }

  render() {
    return (
      <FocusContainer collection="contact">
        <MultiselectList
          ref="list"
          draggable
          className="contact-list"
          columns={[ContactColumn]}
          dataSource={this._source}
          itemPropsProvider={() => ({})}
          itemHeight={40}
          EmptyComponent={ContactsListEmpty}
          onDragStart={() => null}
          onDragEnd={() => null}
        />
      </FocusContainer>
    );
  }
}

export const ContactList = ListensToFluxStore(ContactListWithData, {
  stores: [Store],
  getStateFromStores: () => ({
    selectedGroup: Store.selectedGroup(),
    contacts: Store.filteredContacts(),
  }),
});

ContactList.displayName = 'ContactList';
ContactList.containerStyles = {
  minWidth: 165,
  maxWidth: 450,
};

interface ContactListSearchWithDataProps {
  search: string;
  setSearch: (search: string) => void;
  selectedGroup: ContactSource;
}

const ContactListSearchWithData = (props: ContactListSearchWithDataProps) => {
  let searchContext = 'all contacts';
  if (props.selectedGroup) {
    searchContext = `Found in Mail`;
    const acct = AccountStore.accountForId(props.selectedGroup.accountId);
    if (acct) {
      searchContext += ` (${acct.label})`;
    }
  }

  return (
    <div className="contact-search">
      <RetinaImg
        className="search-accessory search"
        name="searchloupe.png"
        mode={RetinaImg.Mode.ContentDark}
        onClick={() => this._searchEl.current.focus()}
      />
      <input
        type="text"
        ref={this._searchEl}
        value={props.search}
        placeholder={`${localized('Search')} ${searchContext}`}
        onChange={e => props.setSearch(e.currentTarget.value)}
      />
    </div>
  );
};

export const ContactListSearch = ListensToFluxStore(ContactListSearchWithData, {
  stores: [Store],
  getStateFromStores: () => ({
    selectedGroup: Store.selectedGroup(),
    search: Store.search(),
    setSearch: s => Store.setSearch(s),
  }),
});
ContactListSearch.displayName = 'ContactListSearch';
