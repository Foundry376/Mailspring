import { AccountStore } from 'mailspring-exports';
import { Grant, isAccountAllowed } from './grant';

export interface Identity {
  accounts: { id: string; email: string; name: string }[];
  /** Lowercased account addresses and configured aliases. */
  addresses: string[];
}

/** Whether `email` is one of the user's addresses, by the same rule as `Contact.isMe`. */
export function isMyAddress(email: string | null | undefined): boolean {
  return !!email && AccountStore.isMyEmail(email);
}

/** The user's addresses, lowercased for exact matching in SQL. */
export function knownAddresses(): string[] {
  return [...new Set(AccountStore.emailAddresses().map((e) => e.toLowerCase()))];
}

/** The accounts the grant allows, and the addresses (account and aliases) that belong to them. */
export function currentIdentity(grant: Grant): Identity {
  const allowed = AccountStore.accounts().filter((a) => isAccountAllowed(grant, a.id));
  const accounts = allowed.map((a) => ({ id: a.id, email: a.emailAddress, name: a.name || '' }));
  const addresses = AccountStore.aliasesFor(allowed.map((a) => a.id)).map((c) =>
    c.email.toLowerCase()
  );
  return { accounts, addresses: [...new Set(addresses)].sort() };
}
