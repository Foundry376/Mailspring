import React from 'react';
import { Store, ContactsPerspective } from './Store';
import { localized, Actions, AccountStore } from 'mailspring-exports';
import * as Icons from './Icons';
import { ListensToFluxStore, BindGlobalCommands } from 'mailspring-component-kit';

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
    Actions.setFocus({ collection: 'contact', item: null });
    Store.setEditing('new');
  };
  render() {
    const { editing, perspective } = this.props;
    const enabled = editing === false && perspective && perspective.accountId;
    const acct = perspective && AccountStore.accountForId(perspective.accountId);

    return (
      <div style={{ display: 'flex', order: 1000 }}>
        <BindGlobalCommands key={enabled} commands={enabled ? { 'core:add-item': this.onAdd } : {}}>
          <button
            tabIndex={-1}
            disabled={!enabled}
            className={`btn btn-toolbar btn-new-contact ${!enabled && 'btn-disabled'}`}
            title={
              acct
                ? localized('New contact in %@', acct.label)
                : localized('Select an account to add a contact.')
            }
            onClick={enabled ? this.onAdd : undefined}
          >
            <Icons.NewPerson />
          </button>
        </BindGlobalCommands>
      </div>
    );
  }
}

export const AddContactToolbar: React.FunctionComponent<
  AddContactToolbarProps
> = ListensToFluxStore(
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
