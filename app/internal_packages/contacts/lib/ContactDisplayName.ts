import { Contact, localized } from 'mailspring-exports';

/** The name to show for a contact in the contacts window.

Contacts found in mail take their name verbatim from the first sent message's header,
and older clients wrote headers like `"<a@b.com>" <a@b.com>`, `")" <a@b.com>` and
`=?iso-8859-1?Q?=22Ver=F3nica=22?=` (quotes inside the encoded word). CardDAV cards with
an empty FN carry their raw N value (`;;;;`). None of these are names, so we fall back to
the email address. */
export function displayNameForContact({ name, email }: Pick<Contact, 'name' | 'email'>) {
  const unquoted = (name || '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
  const unbracketed = unquoted.replace(/^<(.*)>$/, '$1');
  const isName =
    /[\p{L}\p{N}]/u.test(unquoted) && unbracketed.toLowerCase() !== (email || '').toLowerCase();

  return isName ? unquoted : email || localized('No Name');
}

export function initialsForContact(contact: Pick<Contact, 'name' | 'email'>) {
  const display = displayNameForContact(contact);
  const isRealName = display !== contact.email && display !== localized('No Name');
  if (!isRealName) {
    return (contact.email || '').charAt(0).toUpperCase();
  }
  return display
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
