/*
 * SQL over the addresses the sync engine stores in Message.data, whose from/to/cc/bcc are
 * arrays of {name, email}. Shared by the search bar's from:/to: terms
 * (LocalSearchQueryBackend) and JSON mail filters (mail-access/filter.ts).
 */

export const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

export const ADDRESS_FIELDS = { from: ['from'], to: ['to', 'cc', 'bcc'] };

// Letters, digits and the punctuation common in real addresses, with a dot in the domain:
// `<bob@example.com>`, `bob@example.com,` and `*@example.com` are not addresses but a paste or
// a wildcard, and a dotless domain such as `bob@example` is usually one still being typed.
const WHOLE_ADDRESS = /^[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

// `value` as a whole address, trimmed and lowercased as SQLite's lower() does, or null. lower()
// folds ASCII only, so the result equals `lower(email)` for an address stored with the same
// spelling up to ASCII case. JavaScript's toLowerCase would turn `Ö` into `ö`, which lower()
// of a stored `Ö` never equals.
export function wholeAddress(value: string): string | null {
  const v = value.trim();
  return WHOLE_ADDRESS.test(v) ? v.replace(/[A-Z]+/g, (c) => c.toLowerCase()) : null;
}

// SQL true when the current `Message` row has an address in one of `fields` for which
// `condition`, given the SQL for that address lowercased, is true.
export function messageHasAddressSQL(fields: string[], condition: (email: string) => string) {
  const email = "lower(json_extract(`a`.`value`, '$.email'))";
  const inFields = fields.map(
    (f) =>
      `EXISTS (SELECT 1 FROM json_each(\`Message\`.\`data\`, '$.${f}') AS \`a\` WHERE ${condition(email)})`
  );
  return `(${inFields.join(' OR ')})`;
}
