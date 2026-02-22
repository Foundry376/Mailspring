import fs from 'fs';
import os from 'os';
import path from 'path';
import vCard from 'vcf';
import { v4 } from 'uuid';
import { Contact, SyncbackContactTask, Actions, AccountStore, localized } from 'mailspring-exports';
import { parse, fromVCF } from './ContactInfoMapping';
import { formatDisplayName, serializeBirthday, serializeAddress } from './VCFHelpers';

/**
 * Convert any contact (CardDAV, Google, or mail-sourced) to a VCF string.
 * For CardDAV contacts the raw stored VCF is returned directly; for Google and
 * mail contacts a synthetic VCard 3.0 is generated from the parsed data.
 */
export function contactToVCFString(contact: Contact): string {
  if (contact.source === 'carddav' && contact.info && 'vcf' in contact.info) {
    return contact.info.vcf;
  }

  const card = new vCard();
  const { data } = parse(contact);

  card.set('version', '3.0');
  card.set('uid', contact.id || v4());

  if (data.name) {
    const {
      givenName = '',
      familyName = '',
      honorificPrefix = '',
      honorificSuffix = '',
    } = data.name;
    card.set('n', `${familyName};${givenName};${honorificPrefix};${honorificSuffix}`);
    card.set('fn', data.name.displayName || formatDisplayName(data.name));
  } else if (contact.name) {
    card.set('fn', contact.name);
  }

  if (data.company) card.set('org', data.company);
  if (data.title) card.set('title', data.title);

  (data.emailAddresses || []).forEach(({ value, type }, idx) => {
    const params: Record<string, string> = type ? { type } : {};
    idx === 0 ? card.set('email', value, params) : card.add('email', value, params);
  });

  (data.phoneNumbers || []).forEach(({ value, type }, idx) => {
    const params: Record<string, string> = type ? { type } : {};
    idx === 0 ? card.set('tel', value, params) : card.add('tel', value, params);
  });

  (data.addresses || []).forEach((addr, idx) => {
    const { value, type } = serializeAddress(addr);
    const params: Record<string, string> = type ? { type } : {};
    idx === 0 ? card.set('adr', value, params) : card.add('adr', value, params);
  });

  if (data.birthdays?.length) {
    card.set('bday', serializeBirthday(data.birthdays[0]).value);
  }

  (data.urls || []).forEach(({ value, type }, idx) => {
    const params: Record<string, string> = type ? { type } : {};
    idx === 0 ? card.set('url', value, params) : card.add('url', value, params);
  });

  (data.relations || []).forEach(({ person, type }, idx) => {
    const params: Record<string, string> = type ? { type } : {};
    idx === 0 ? card.set('related', person, params) : card.add('related', person, params);
  });

  (data.nicknames || []).forEach(({ value }, idx) => {
    idx === 0 ? card.set('nickname', value) : card.add('nickname', value);
  });

  // The vcf library emits \n; RFC 6350 requires \r\n.
  return card.toString().replace(/\n/g, '\r\n');
}

/**
 * Generate the content of a .vcf file containing one or more contacts.
 * vCards are separated by a blank line as permitted by RFC 6350.
 */
export function contactsToVCFFileContent(contacts: Contact[]): string {
  return contacts.map(contactToVCFString).join('\r\n');
}

/**
 * Write the given contacts to a temporary .vcf file and return its path.
 * Used to populate the DownloadURL during drag-to-desktop.
 */
export function writeContactsToTempVCF(contacts: Contact[]): string {
  const safeName =
    contacts.length === 1
      ? (contacts[0].name || 'contact').replace(/[^a-z0-9 ]/gi, '_').trim() || 'contact'
      : 'contacts';
  const filename = `${safeName}.vcf`;
  const filePath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filePath, contactsToVCFFileContent(contacts), 'utf-8');
  return filePath;
}

/**
 * Parse a .vcf file's text content into Contact objects for the given account.
 * RFC 6350 allows multiple vCards to be concatenated in a single file.
 */
export function vcfStringToContacts(vcfContent: string, accountId: string): Contact[] {
  const vcardRegex = /BEGIN:VCARD[\s\S]+?END:VCARD/gi;
  const matches = vcfContent.match(vcardRegex) || [];

  return matches
    .map((vcardString): Contact | null => {
      // Normalise line endings to \r\n (required by safeParseVCard).
      vcardString = vcardString.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

      // Inject VERSION:3.0 if missing so safeParseVCard doesn't throw.
      if (!vcardString.match(/^VERSION:/im)) {
        vcardString = vcardString.replace(
          /BEGIN:VCARD\r\n/i,
          'BEGIN:VCARD\r\nVERSION:3.0\r\n'
        );
      }

      // Inject a UID if missing so the sync engine can track the contact.
      if (!vcardString.match(/^UID:/im)) {
        vcardString = vcardString.replace(/END:VCARD/i, `UID:${v4()}\r\nEND:VCARD`);
      }

      const info = { vcf: vcardString, href: '' };
      let name = '';
      let email = '';

      try {
        const parsed = fromVCF(info);
        name = parsed.data.name?.displayName || formatDisplayName(parsed.data.name) || '';
        email = (parsed.data.emailAddresses?.[0] || { value: '' }).value;
      } catch (err) {
        console.warn('VCF import: failed to parse vCard:', err);
        return null;
      }

      if (!name && !email) return null;

      return new Contact({ source: 'carddav', name, email, accountId, info });
    })
    .filter((c): c is Contact => c !== null);
}

/**
 * Show a native save dialog and write the given contacts to a .vcf file.
 */
export function exportContactsToFile(contacts: Contact[]) {
  if (contacts.length === 0) return;
  const defaultName =
    contacts.length === 1 ? `${contacts[0].name || 'contact'}.vcf` : 'contacts.vcf';
  AppEnv.showSaveDialog({ defaultPath: defaultName }, filePath => {
    if (!filePath) return;
    try {
      fs.writeFileSync(filePath, contactsToVCFFileContent(contacts), 'utf-8');
    } catch (err) {
      console.error('VCF export failed:', err);
    }
  });
}

/**
 * Show a native open-file dialog and queue SyncbackContactTask for each valid
 * contact found in the selected .vcf file(s).
 *
 * Import is only supported for CardDAV accounts; Google (gpeople) accounts do
 * not support creating contacts via the VCF path in the sync engine.
 */
export function importContactsFromFile(accountId: string) {
  const account = AccountStore.accountForId(accountId);
  if (!account) return;

  if (account.provider === 'gmail') {
    require('@electron/remote').dialog.showMessageBox({
      type: 'info',
      title: localized('Import Not Supported'),
      message: localized(
        'Importing VCards is not supported for Google accounts. Please use contacts.google.com to import contacts into this account.'
      ),
      buttons: [localized('OK')],
    });
    return;
  }

  AppEnv.showOpenDialog(
    {
      title: localized('Import VCards'),
      filters: [{ name: 'VCard Files', extensions: ['vcf', 'vcard'] }],
      properties: ['openFile', 'multiSelections'],
    },
    filePaths => {
      if (!filePaths || filePaths.length === 0) return;

      let contacts: Contact[] = [];
      for (const filePath of filePaths) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          contacts = contacts.concat(vcfStringToContacts(content, accountId));
        } catch (err) {
          console.error(`VCF import: failed to read ${filePath}:`, err);
        }
      }

      if (contacts.length === 0) {
        require('@electron/remote').dialog.showMessageBox({
          type: 'info',
          title: localized('No Contacts Found'),
          message: localized('No valid contacts were found in the selected file(s).'),
          buttons: [localized('OK')],
        });
        return;
      }

      for (const contact of contacts) {
        Actions.queueTask(SyncbackContactTask.forCreating({ contact, accountId }));
      }
    }
  );
}
