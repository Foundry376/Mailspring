import React from 'react';
import { Store, ContactsPerspective } from './Store';
import { localized, Actions, AccountStore } from 'mailspring-exports';
import classnames from 'classnames';
import {
  ListensToFluxStore,
  BindGlobalCommands,
  NewItemButton,
  SVGIcons,
} from 'mailspring-component-kit';
import { showGPeopleReadonlyNotice } from './GoogleSupport';

interface AddContactToolbarProps {
  editing: string | 'new' | false;
  perspective: ContactsPerspective;
  focusedId?: string;
}

class AddContactToolbarWithData extends React.Component<AddContactToolbarProps> {
  constructor(props: AddContactToolbarProps) {
    super(props);
  }

  onAdd = () => {
    const { perspective } = this.props;

    if (!('accountId' in perspective)) return;
    if (showGPeopleReadonlyNotice(perspective.accountId)) return;

    Actions.setFocus({ collection: 'contact', item: null });
    Store.setEditing('new');
  };

  render() {
    const { editing, perspective } = this.props;
    const enabled =
      'accountId' in perspective &&
      editing === false &&
      perspective.accountId &&
      perspective.type !== 'found-in-mail';
    const acct = 'accountId' in perspective && AccountStore.accountForId(perspective.accountId);

    return (
      <BindGlobalCommands
        key={`${enabled}`}
        commands={enabled ? { 'core:add-item': this.onAdd } : {}}
      >
        <NewItemButton
          label={localized('New Contact')}
          title={
            acct
              ? localized('New contact in %@', acct.label)
              : localized('Select an account to add a contact.')
          }
          matchWidthOf={[localized('Compose'), localized('New Event')]}
          icon={<SVGIcons.NewPerson />}
          disabled={!enabled}
          className={classnames('btn-new-contact', { 'btn-disabled': !enabled })}
          onClick={enabled ? this.onAdd : undefined}
        />
      </BindGlobalCommands>
    );
  }
}

export const AddContactToolbar: React.FunctionComponent<AddContactToolbarProps> =
  ListensToFluxStore(
    ({ listSource, editing, perspective }) => (
      <AddContactToolbarWithData editing={editing} perspective={perspective} />
    ),
    {
      stores: [Store],
      getStateFromStores: () => ({
        editing: Store.editing(),
        perspective: Store.perspective(),
      }),
    }
  );

AddContactToolbar.displayName = 'AddContactToolbar';
