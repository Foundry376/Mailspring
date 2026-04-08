import React from 'react';
import {
  ListensToFluxStore,
  ListDataSource,
  RetinaImg,
  BindGlobalCommands,
} from 'mailspring-component-kit';
import { Store, ContactsPerspective } from './Store';
import {
  localized,
  DestroyContactTask,
  Actions,
  Contact,
  ChangeContactGroupMembershipTask,
  FocusedContentStore,
} from 'mailspring-exports';
import { showGPeopleReadonlyNotice } from './GoogleSupport';
import { exportContactsToFile } from './VCFImportExport';

interface ContactDetailToolbarProps {
  editing: string | 'new' | false;
  listSource: ListDataSource;
  perspective: ContactsPerspective;
  /** Primary selection from click; may be empty on root sheets when only the keyboard cursor moved. */
  focusedId?: string;
  keyboardCursorId?: string;
}

class ContactDetailToolbarWithData extends React.Component<ContactDetailToolbarProps> {
  constructor(props: ContactDetailToolbarProps) {
    super(props);
  }

  _onRemoveFromSource = () => {
    if (this.props.perspective.type !== 'group') {
      throw new Error('Remove from source but perspective is not a group');
      return;
    }
    if (showGPeopleReadonlyNotice(this.props.perspective.accountId)) {
      return;
    }

    const groupId = this.props.perspective.groupId;
    const group = Store.groups().find(g => g.id === groupId);

    Actions.queueTask(
      ChangeContactGroupMembershipTask.forMoving({
        contacts: this.actionSet(),
        group: group,
        direction: 'remove',
      })
    );
  };

  _onEdit = () => {
    const contacts = this.actionSet();
    const contact = contacts[0];
    if (!contact || showGPeopleReadonlyNotice(contact.accountId)) {
      return;
    }
    Store.setEditing(contact.id);
  };

  _onDelete = () => {
    const contacts = this.actionSet();
    if (contacts.some(c => c.source === 'gpeople' && showGPeopleReadonlyNotice(c.accountId))) {
      return;
    }
    Actions.queueTask(
      DestroyContactTask.forRemoving({
        contacts: this.actionSet(),
      })
    );
  };

  actionSet() {
    const { listSource, focusedId, keyboardCursorId } = this.props;
    const activeId = focusedId || keyboardCursorId;
    const focused = activeId && listSource.getById(activeId);
    const models = focused ? [focused] : listSource.selection.items();
    return (models as any) as Contact[];
  }

  render() {
    const { perspective, editing } = this.props;
    const actionSet = this.actionSet();
    const editable = actionSet.length === 1;

    if (editing) {
      return <span />;
    }

    const commands = {};
    if (perspective.type === 'group' && actionSet.length > 0) {
      commands['core:remove-from-view'] = this._onRemoveFromSource;
    }
    if (actionSet.length > 0) {
      commands['core:delete-item'] = this._onDelete;
      commands['contacts:export-vcf-selected'] = () => exportContactsToFile(actionSet);
    }
    if (editable) {
      commands['core:edit-item'] = this._onEdit;
    }

    return (
      <BindGlobalCommands key={Object.keys(commands).join(',')} commands={commands}>
        <div style={{ display: 'flex', order: 1000, marginRight: 10 }}>
          {perspective.type === 'group' && (
            <button
              tabIndex={-1}
              title={localized('Remove from Group')}
              className={`btn btn-toolbar ${actionSet.length === 0 && 'btn-disabled'}`}
              onClick={actionSet.length > 0 ? this._onRemoveFromSource : undefined}
            >
              {localized('Remove from Group')}
            </button>
          )}
          <button
            tabIndex={-1}
            title={localized('Delete')}
            aria-label={localized('Delete')}
            className={`btn btn-toolbar ${actionSet.length === 0 && 'btn-disabled'}`}
            onClick={actionSet.length > 0 ? this._onDelete : undefined}
          >
            <RetinaImg
              name="toolbar-trash.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
          <button
            tabIndex={-1}
            title={localized('Export vCard')}
            aria-label={localized('Export vCard')}
            className={`btn btn-toolbar ${actionSet.length === 0 && 'btn-disabled'}`}
            onClick={actionSet.length > 0 ? () => exportContactsToFile(actionSet) : undefined}
          >
            <RetinaImg
              name="toolbar-export-contact.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
          <button
            tabIndex={-1}
            title={localized('Edit')}
            className={`btn btn-toolbar ${!editable && 'btn-disabled'}`}
            onClick={editable ? this._onEdit : undefined}
          >
            {localized('Edit')}
          </button>
        </div>
      </BindGlobalCommands>
    );
  }
}

export const ContactDetailToolbar: React.FunctionComponent<ContactDetailToolbarProps> = ListensToFluxStore(
  ({ listSource, editing, perspective, focusedId, keyboardCursorId }) => (
    <ContactDetailToolbarWithData
      listSource={listSource}
      editing={editing}
      perspective={perspective}
      focusedId={focusedId}
      keyboardCursorId={keyboardCursorId}
    />
  ),
  {
    stores: [Store, FocusedContentStore],
    getStateFromStores: () => ({
      editing: Store.editing(),
      listSource: Store.listSource(),
      perspective: Store.perspective(),
      focusedId: FocusedContentStore.focusedId('contact'),
      keyboardCursorId: FocusedContentStore.keyboardCursorId('contact'),
    }),
  }
);

ContactDetailToolbar.displayName = 'ContactDetailToolbar';
