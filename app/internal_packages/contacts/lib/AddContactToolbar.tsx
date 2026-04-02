import React from 'react';
import { Store, ContactsPerspective } from './Store';
import { localized, Actions, AccountStore } from 'mailspring-exports';
import * as Icons from './SVGIcons';
import { ListensToFluxStore, BindGlobalCommands } from 'mailspring-component-kit';
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
    let accountId: string | null = null;

    if ('accountId' in perspective && perspective.accountId) {
      accountId = perspective.accountId;
    } else if (perspective.type === 'unified') {
      const accounts = AccountStore.accounts();
      const pick = accounts.find(a => a.provider !== 'gmail') || accounts[0];
      if (pick) {
        accountId = pick.id;
        Store.setPerspective({
          type: 'all',
          accountId: pick.id,
          label: localized('All Contacts'),
        });
      }
    }

    if (!accountId) return;
    if (showGPeopleReadonlyNotice(accountId)) return;

    Actions.setFocus({ collection: 'contact', item: null });
    Store.setEditing('new');
  };

  render() {
    const { editing, perspective } = this.props;
    const hasAccounts = AccountStore.accounts().length > 0;
    const enabled =
      editing === false &&
      perspective.type !== 'found-in-mail' &&
      hasAccounts &&
      (('accountId' in perspective && !!perspective.accountId) || perspective.type === 'unified');
    const acct =
      'accountId' in perspective && perspective.accountId
        ? AccountStore.accountForId(perspective.accountId)
        : null;

    return (
      <div style={{ display: 'flex', order: 1000 }}>
        <BindGlobalCommands
          key={`${enabled}`}
          commands={enabled ? { 'core:add-item': this.onAdd } : {}}
        >
          <button
            disabled={!enabled}
            className={`btn btn-toolbar btn-new-contact ${!enabled && 'btn-disabled'}`}
            title={
              acct
                ? localized('New contact in %@', acct.label)
                : perspective.type === 'unified' && hasAccounts
                ? localized('New contact')
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

export const AddContactToolbar: React.FunctionComponent<AddContactToolbarProps> = ListensToFluxStore(
  ({ editing, perspective }) => (
    <AddContactToolbarWithData editing={editing} perspective={perspective} />
  ),
  {
    stores: [Store, AccountStore],
    getStateFromStores: () => ({
      editing: Store.editing(),
      perspective: Store.perspective(),
    }),
  }
);

AddContactToolbar.displayName = 'AddContactToolbar';
