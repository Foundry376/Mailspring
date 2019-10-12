import React from 'react';
import { Contact, localized, CanvasUtils } from 'mailspring-exports';
import {
  FocusContainer,
  MultiselectList,
  ListTabular,
  RetinaImg,
  ListensToFluxStore,
  ListDataSource,
} from 'mailspring-component-kit';
import { ContactsPerspective, Store } from './Store';
import _ from 'underscore';

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
  listSource: ListDataSource;
  perspective: ContactsPerspective;
}

class ContactListWithData extends React.Component<ContactListProps> {
  _searchEl = React.createRef<HTMLInputElement>();

  _onDragItems = (event, items) => {
    const data = {
      ids: items.map(c => c.id),
      accountIds: _.uniq(items.map(t => t.accountId)),
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dragEffect = 'move';

    const canvas = CanvasUtils.canvasForDragging('contacts', data.ids.length);
    event.dataTransfer.setDragImage(canvas, 10, 10);
    event.dataTransfer.setData('mailspring-contacts-data', JSON.stringify(data));
    event.dataTransfer.setData(`mailspring-accounts=${data.accountIds.join(',')}`, '1');
  };

  render() {
    return (
      <FocusContainer collection="contact">
        <MultiselectList
          ref="list"
          draggable
          key={JSON.stringify(this.props.perspective)}
          className="contact-list"
          columns={[ContactColumn]}
          dataSource={this.props.listSource}
          itemPropsProvider={() => ({})}
          itemHeight={32}
          EmptyComponent={ContactsListEmpty}
          onDragItems={this._onDragItems}
          onDragEnd={() => null}
        />
      </FocusContainer>
    );
  }
}

export const ContactList = ListensToFluxStore(ContactListWithData, {
  stores: [Store],
  getStateFromStores: () => ({
    perspective: Store.perspective(),
    listSource: Store.listSource(),
  }),
});

ContactList.displayName = 'ContactList';
ContactList.containerStyles = {
  minWidth: 140,
  maxWidth: 450,
};

interface ContactListSearchWithDataProps {
  search: string;
  setSearch: (search: string) => void;
  perspective: ContactsPerspective;
}

const ContactListSearchWithData = (props: ContactListSearchWithDataProps) => {
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
        placeholder={`${localized('Search')} ${
          props.perspective ? props.perspective.label : 'All Contacts'
        }`}
        onChange={e => props.setSearch(e.currentTarget.value)}
      />
      {props.search.length > 0 && (
        <RetinaImg
          name="searchclear.png"
          className="search-accessory clear"
          mode={RetinaImg.Mode.ContentDark}
          onMouseDown={() => props.setSearch('')}
        />
      )}
    </div>
  );
};

export const ContactListSearch = ListensToFluxStore(ContactListSearchWithData, {
  stores: [Store],
  getStateFromStores: () => ({
    perspective: Store.perspective(),
    search: Store.search(),
    setSearch: s => Store.setSearch(s),
  }),
});
ContactListSearch.displayName = 'ContactListSearch';
