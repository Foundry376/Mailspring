import React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
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
import { exportContactsToFile } from './VCFImportExport';

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
    const group = Store.groups().find((g) => g.id === groupId);

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
    if (contacts.some((c) => c.source === 'gpeople' && showGPeopleReadonlyNotice(c.accountId))) {
      return;
    }
    // DestroyContactTask can't be undone, so confirm before removing the contact from the server.
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      message:
        contacts.length === 1
          ? localized('Delete %@?', contacts[0].name || contacts[0].email)
          : localized('Delete %@ contacts?', contacts.length),
      detail: localized(
        'This contact will be removed from your address book. This cannot be undone.'
      ),
      buttons: [localized('Delete'), localized('Cancel')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) {
      return;
    }
    // A task runs in one account's sync process, which can only delete that account's contacts.
    const byAccount = new Map<string, Contact[]>();
    for (const contact of this.actionSet()) {
      byAccount.set(contact.accountId, [...(byAccount.get(contact.accountId) || []), contact]);
    }
    for (const contacts of byAccount.values()) {
      Actions.queueTask(DestroyContactTask.forRemoving({ contacts }));
    }
  };

  actionSet() {
    const { listSource, focusedId } = this.props;
    const focused = focusedId && listSource.getById(focusedId);
    const models = focused ? [focused] : listSource.selection.items();
    return models as any as Contact[];
  }

  render() {
    const { perspective, editing } = this.props;
    const actionSet = editing ? [] : this.actionSet();
    const editable = actionSet.length === 1 && actionSet[0].source !== 'mail';

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

    const fadeIn = (key: string, button: React.ReactElement) => (
      <CSSTransition key={key} classNames="opacity-125ms" timeout={125}>
        {button}
      </CSSTransition>
    );

    return (
      <BindGlobalCommands commands={commands}>
        <TransitionGroup component="div" style={{ display: 'flex', order: 1000 }}>
          {commands['core:remove-from-view'] &&
            fadeIn(
              'remove-from-group',
              <button
                tabIndex={-1}
                title={localized('Remove from Group')}
                className="btn btn-toolbar"
                onClick={this._onRemoveFromSource}
              >
                {localized('Remove from Group')}
              </button>
            )}
          {commands['core:delete-item'] &&
            fadeIn(
              'delete',
              <button
                tabIndex={-1}
                title={localized('Delete')}
                aria-label={localized('Delete')}
                className="btn btn-toolbar"
                onClick={this._onDelete}
              >
                <RetinaImg
                  name="toolbar-trash.png"
                  mode={RetinaImg.Mode.ContentIsMask}
                  aria-hidden="true"
                />
              </button>
            )}
          {commands['contacts:export-vcf-selected'] &&
            fadeIn(
              'export',
              <button
                tabIndex={-1}
                title={localized('Export vCard')}
                aria-label={localized('Export vCard')}
                className="btn btn-toolbar"
                onClick={commands['contacts:export-vcf-selected']}
              >
                <RetinaImg
                  name="toolbar-download.png"
                  mode={RetinaImg.Mode.ContentIsMask}
                  aria-hidden="true"
                />
              </button>
            )}
          {commands['core:edit-item'] &&
            fadeIn(
              'edit',
              <button
                tabIndex={-1}
                title={localized('Edit')}
                className="btn btn-toolbar"
                onClick={this._onEdit}
              >
                {localized('Edit')}
              </button>
            )}
        </TransitionGroup>
      </BindGlobalCommands>
    );
  }
}

export const ContactDetailToolbar: React.FunctionComponent<ContactDetailToolbarProps> =
  ListensToFluxStore(
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
