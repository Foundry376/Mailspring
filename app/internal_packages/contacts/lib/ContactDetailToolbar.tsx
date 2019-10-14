import React from 'react';
import {
  FocusContainer,
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
} from 'mailspring-exports';
import { showGPeopleReadonlyNotice } from './GoogleSupport';

interface ContactDetailToolbarProps {
  editing: string | 'new' | false;
  listSource: ListDataSource;
  perspective: ContactsPerspective;
  focusedId?: string;
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
    if (showGPeopleReadonlyNotice(this.props.perspective.accountId)) {
      return;
    }
    const actionSet = this.actionSet();
    Store.setEditing(actionSet[0].id);
  };

  _onDelete = () => {
    const contacts = this.actionSet();
    if (
      contacts.some(c => c.source === 'gpeople') &&
      showGPeopleReadonlyNotice(this.props.perspective.accountId)
    ) {
      return;
    }

    Actions.queueTask(
      DestroyContactTask.forRemoving({
        contacts: this.actionSet(),
      })
    );
  };

  actionSet() {
    const { listSource, focusedId } = this.props;
    const focused = focusedId && listSource.getById(focusedId);
    const models = focused ? [focused] : listSource.selection.items();
    return (models as any) as Contact[];
  }

  render() {
    const { perspective, editing } = this.props;
    const actionSet = this.actionSet();
    const editable = actionSet.length === 1 && actionSet[0].source !== 'mail';

    if (editing) {
      return <span />;
    }

    const commands = {};
    if (perspective && perspective.type === 'group' && actionSet.length > 0) {
      commands['core:remove-from-view'] = this._onRemoveFromSource;
    }
    if (actionSet.length > 0) {
      commands['core:delete-item'] = this._onDelete;
    }
    if (editable) {
      commands['core:edit-item'] = this._onEdit;
    }

    return (
      <BindGlobalCommands key={Object.keys(commands).join(',')} commands={commands}>
        <div style={{ display: 'flex', order: 1000, marginRight: 10 }}>
          {perspective && perspective.type === 'group' && (
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
            className={`btn btn-toolbar ${actionSet.length === 0 && 'btn-disabled'}`}
            onClick={actionSet.length > 0 ? this._onDelete : undefined}
          >
            <RetinaImg name="toolbar-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
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

export const ContactDetailToolbar: React.FunctionComponent<
  ContactDetailToolbarProps
> = ListensToFluxStore(
  ({ listSource, editing, perspective }) => (
    <FocusContainer collection="contact">
      <ContactDetailToolbarWithData
        listSource={listSource}
        editing={editing}
        perspective={perspective}
      />
    </FocusContainer>
  ),
  {
    stores: [Store],
    getStateFromStores: () => ({
      editing: Store.editing(),
      listSource: Store.listSource(),
      perspective: Store.perspective(),
    }),
  }
);

ContactDetailToolbar.displayName = 'ContactDetailToolbar';
