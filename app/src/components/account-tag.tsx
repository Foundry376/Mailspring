import React from 'react';
import { AccountStore } from '../flux/stores/account-store';
import FocusedPerspectiveStore from '../flux/stores/focused-perspective-store';
import { useConfigValue } from './use-config-value';

// Tiny label pinned to the row's top-left corner naming the account a thread belongs to.
// Renders nothing unless the focused perspective spans several accounts (e.g. the unified
// inbox), where rows are otherwise ambiguous.
export const AccountTag: React.FC<{ accountId: string }> = ({ accountId }) => {
  const enabled = useConfigValue<boolean>('core.workspace.showAccountLabel');
  if (!enabled) return null;
  if (FocusedPerspectiveStore.current().accountIds.length < 2) return null;

  const account = AccountStore.accountForId(accountId);
  if (!account) return null;

  return (
    <span
      className="account-tag"
      style={account.color ? { backgroundColor: account.color } : undefined}
      title={account.emailAddress}
    >
      {account.label}
    </span>
  );
};
AccountTag.displayName = 'AccountTag';

export default AccountTag;
