import React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { Store, ContactsPerspective } from './Store';
import { localized, Account, AccountStore, Actions, WorkspaceStore } from 'mailspring-exports';
import {
  ListensToFluxStore,
  BindGlobalCommands,
  NewItemButton,
  SVGIcons,
} from 'mailspring-component-kit';
import { showGPeopleReadonlyNotice } from './GoogleSupport';

interface AddContactToolbarProps {
  perspective: ContactsPerspective;
  accounts: Account[];
}

/** The account a new contact goes in without asking, or null when the user picks one. */
export function accountForNewContact(perspective: ContactsPerspective, accounts: Account[]) {
  const shown = 'accountId' in perspective && accounts.find((a) => a.id === perspective.accountId);
  if (shown) return shown;
  return accounts.length === 1 ? accounts[0] : null;
}

export function startNewContact(accountId: string) {
  if (showGPeopleReadonlyNotice(accountId)) return;
  if (!WorkspaceStore.mayLeaveSection()) return;
  Actions.setFocus({ collection: 'contact', item: null });
  Store.startNewContact(accountId);
}

class AddContactToolbarWithData extends React.Component<AddContactToolbarProps> {
  _button = React.createRef<HTMLButtonElement>();

  onAdd = () => {
    const { perspective, accounts } = this.props;
    const account = accountForNewContact(perspective, accounts);
    if (account) {
      startNewContact(account.id);
      return;
    }
    const rect = this._button.current.getBoundingClientRect();
    require('@electron/remote')
      .Menu.buildFromTemplate(
        accounts.map((a) => ({ label: a.label, click: () => startNewContact(a.id) }))
      )
      .popup({ x: Math.round(rect.left), y: Math.round(rect.bottom) });
  };

  render() {
    const { perspective, accounts } = this.props;
    const account = accountForNewContact(perspective, accounts);

    return (
      <TransitionGroup component={null}>
        {accounts.length > 0 && (
          <CSSTransition key="new-contact" classNames="opacity-125ms" timeout={125}>
            <BindGlobalCommands commands={{ 'core:add-item': this.onAdd }}>
              <NewItemButton
                buttonRef={this._button}
                label={localized('New Contact')}
                title={account ? localized('New contact in %@', account.label) : undefined}
                matchWidthOf={[localized('Compose'), localized('New Event')]}
                icon={<SVGIcons.NewPerson />}
                className="btn-new-contact"
                onClick={this.onAdd}
              />
            </BindGlobalCommands>
          </CSSTransition>
        )}
      </TransitionGroup>
    );
  }
}

export const AddContactToolbar: React.FunctionComponent<AddContactToolbarProps> =
  ListensToFluxStore(AddContactToolbarWithData, {
    stores: [Store, AccountStore],
    getStateFromStores: () => ({
      perspective: Store.perspective(),
      accounts: Store.accountsWithContactBooks(),
    }),
  });

AddContactToolbar.displayName = 'AddContactToolbar';
