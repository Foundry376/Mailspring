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

function defaultContactAccountId() {
  const accounts = AccountStore.accounts();
  const pick = accounts.find(a => a.provider !== 'gmail') || accounts[0];
  return pick ? pick.id : null;
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
    } else if (
      perspective.type === 'unified' ||
      perspective.type === 'local-group' ||
      perspective.type === 'local-all'
    ) {
      accountId = defaultContactAccountId();
    }

    if (!accountId) return;
    if (showGPeopleReadonlyNotice(accountId)) return;

    Actions.setFocus({ collection: 'contact', item: null });
    Store.setEditing('new');
  };

  render() {
    const { editing, perspective } = this.props;
    const hasAccounts = AccountStore.accounts().length > 0;
    const resolvedAccountId =
      'accountId' in perspective && perspective.accountId
        ? perspective.accountId
        : perspective.type === 'unified' ||
          perspective.type === 'local-group' ||
          perspective.type === 'local-all'
        ? defaultContactAccountId()
        : null;
    const enabled =
      editing === false &&
      perspective.type !== 'found-in-mail' &&
      hasAccounts &&
      !!resolvedAccountId;
    const acct = resolvedAccountId ? AccountStore.accountForId(resolvedAccountId) : null;

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
