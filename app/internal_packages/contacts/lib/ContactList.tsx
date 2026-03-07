import React, { CSSProperties, useRef } from 'react';
import ReactDOM from 'react-dom';
import { webUtils } from 'electron';
import { Contact, localized, CanvasUtils, AccountStore } from 'mailspring-exports';
import {
  FocusContainer,
  MultiselectList,
  ListTabular,
  RetinaImg,
  ListensToFluxStore,
  ListDataSource,
} from 'mailspring-component-kit';
import { ContactsPerspective, Store } from './Store';
import { writeContactsToTempVCF, importContactsFromPaths } from './VCFImportExport';
import { ContactListContextMenu } from './ContactListContextMenu';
import _ from 'underscore';

const ContactColumn = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: (contact: Contact) => {
    // until we revisit the UI to accommodate more icons
    const account = AccountStore.accountForId(contact.accountId);
    let style: CSSProperties = {}
    if (account && account.color) {
      style = {
        height: '50%',
        paddingLeft: '4px',
        borderLeftWidth: '4px',
        borderLeftColor: account.color,
        borderLeftStyle: 'solid',
      }
    }
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={style} className="subject" dir="auto">
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

interface ContactListState {
  draggingFiles: boolean;
}

class ContactListWithData extends React.Component<ContactListProps, ContactListState> {
  _dragCounter = 0;

  refs: {
    list: MultiselectList;
  };

  constructor(props: ContactListProps) {
    super(props);
    this.state = { draggingFiles: false };
  }

  componentDidMount() {
    ReactDOM.findDOMNode(this).addEventListener('contextmenu', this._onShowContextMenu);
  }

  componentWillUnmount() {
    ReactDOM.findDOMNode(this).removeEventListener('contextmenu', this._onShowContextMenu);
  }

  _onShowContextMenu = (event: MouseEvent) => {
    if (!this.refs.list) return;
    const contacts = this.refs.list.itemsForMouseEvent(event) as Contact[];
    if (!contacts || contacts.length === 0) return;
    new ContactListContextMenu(contacts).displayMenu();
  };

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

    // Allow the contacts to be dragged to the desktop as a .vcf file.
    try {
      const filePath = writeContactsToTempVCF(items as Contact[]);
      const filename = require('path').basename(filePath);
      // The DownloadURL second segment MUST match the last path component of the URL.
      event.dataTransfer.setData('DownloadURL', `text/vcard:${filename}:file://${filePath}`);
    } catch (err) {
      console.warn('Could not write temp VCF for drag export:', err);
    }
  };

  // --- VCF file drop-into-list handling ---

  _isFileDrag(e: React.DragEvent) {
    return e.dataTransfer.types.includes('Files');
  }

  _onFileDragEnter = (e: React.DragEvent) => {
    if (!this._isFileDrag(e)) return;
    this._dragCounter++;
    if (this._dragCounter === 1) this.setState({ draggingFiles: true });
  };

  _onFileDragLeave = (e: React.DragEvent) => {
    if (!this._isFileDrag(e)) return;
    this._dragCounter--;
    if (this._dragCounter === 0) this.setState({ draggingFiles: false });
  };

  _onFileDragOver = (e: React.DragEvent) => {
    if (!this._isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  _onFileDrop = (e: React.DragEvent) => {
    if (!this._isFileDrag(e)) return;
    e.preventDefault();
    this._dragCounter = 0;
    this.setState({ draggingFiles: false });

    const vcfFiles = Array.from(e.dataTransfer.files).filter(f => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.vcf') || lower.endsWith('.vcard');
    });
    if (vcfFiles.length === 0) return;

    const { perspective } = this.props;
    if (!('accountId' in perspective)) {
      require('@electron/remote').dialog.showMessageBox({
        type: 'info',
        title: localized('Select an Account'),
        message: localized(
          'Please select a specific account from the sidebar before importing contacts.'
        ),
        buttons: [localized('OK')],
      });
      return;
    }

    importContactsFromPaths(vcfFiles.map(f => webUtils.getPathForFile(f)), perspective.accountId);
  };

  render() {
    const { draggingFiles } = this.state;
    return (
      <div
        className={`contact-list-drop-target${draggingFiles ? ' dragging-files' : ''}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}
        onDragEnter={this._onFileDragEnter}
        onDragLeave={this._onFileDragLeave}
        onDragOver={this._onFileDragOver}
        onDrop={this._onFileDrop}
      >
        {draggingFiles && (
          <div className="vcf-drop-overlay">
            <div className="vcf-drop-overlay-label">{localized('Drop to Import VCards')}</div>
          </div>
        )}
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
      </div>
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
  const searchEl = useRef<HTMLInputElement>(null);
  return (
    <div className="contact-search">
      <RetinaImg
        className="search-accessory search"
        name="searchloupe.png"
        mode={RetinaImg.Mode.ContentDark}
        onClick={() => searchEl.current?.focus()}
      />
      <input
        type="text"
        ref={searchEl}
        value={props.search}
        placeholder={`${localized('Search')} ${props.perspective.type === 'unified' ? 'All Contacts' : props.perspective.label
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
