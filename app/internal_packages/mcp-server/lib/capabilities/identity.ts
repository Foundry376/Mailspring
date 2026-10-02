import { AccountStore, DatabaseStore } from 'mailspring-exports';

export interface Identity {
  accounts: { id: string; email: string; name: string }[];
  /**
   * Lowercased. Account addresses, configured aliases, addresses found in Sent, and addresses
   * that send under one of the user's account names.
   */
  addresses: string[];
}

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

let configured = new Set<string>();
let discovered = new Set<string>();
let accounts: Identity['accounts'] = [];
let lastDiscovery = 0;
let discovery: Promise<void> | null = null;

function loadConfigured() {
  accounts = AccountStore.accounts().map((a) => ({
    id: a.id,
    email: a.emailAddress,
    name: a.name || '',
  }));
  configured = new Set(
    AccountStore.emailAddresses()
      .filter(Boolean)
      .map((e) => e.toLowerCase())
  );
}

// Users send from addresses that aren't configured anywhere in Mailspring: old aliases,
// forwarding addresses, a Gmail address on an iCloud account. Every message in a Sent folder
// (or carrying Gmail's \Sent label) was sent by the user, so its From address is theirs.
const SENT_FROM_SQL =
  "SELECT DISTINCT lower(json_extract(`Message`.`data`, '$.from[0].email')) AS email " +
  'FROM `Message` WHERE `Message`.`draft` = 0 AND (' +
  '`Message`.`id` IN (SELECT `messageId` FROM `MessageFolder` WHERE `folderId` IN ' +
  "(SELECT `id` FROM `Folder` WHERE `role` = 'sent')) OR " +
  "EXISTS (SELECT 1 FROM json_each(`Message`.`data`, '$.labels') WHERE `value` = '\\Sent'))";

// Old work and personal addresses often appear only in received mail (a copy sent to yourself,
// a CC from a past job) with no copy in Sent. Mail From one of the user's account names, exactly
// or with a parenthetical ("Ben Gotow (Work)"), is theirs too. Single-word names are skipped
// because they collide too easily, and so are automated senders ("Ben Gotow on LinkedIn" is
// already excluded by the exact match; notification addresses by the pattern).
const FROM_NAMES_SQL =
  "SELECT DISTINCT lower(json_extract(`Message`.`data`, '$.from[0].email')) AS email, " +
  "lower(trim(json_extract(`Message`.`data`, '$.from[0].name'))) AS name " +
  'FROM `Message` WHERE `Message`.`draft` = 0';
const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon)([._+-]|@)/i;

function addressesUsingMyNames(rows: { email: string; name: string }[]) {
  const names = accounts
    .map((a) => (a.name || '').trim().toLowerCase())
    .filter((n) => n.includes(' '));
  if (names.length === 0) return [];
  return rows
    .filter((r) => r.email && r.name && !AUTOMATED.test(r.email))
    .filter((r) => names.some((n) => r.name === n || r.name.startsWith(`${n} (`)))
    .map((r) => r.email);
}

async function discoverSentFromAddresses() {
  const query = (DatabaseStore as any)._query.bind(DatabaseStore);
  const [sent, named] = await Promise.all([
    query(SENT_FROM_SQL, [], true),
    query(FROM_NAMES_SQL, [], true),
  ]);
  discovered = new Set(
    [...sent.map((r) => r.email), ...addressesUsingMyNames(named)].filter(
      (e) => e && e.includes('@')
    )
  );
  lastDiscovery = Date.now();
}

/** Starts (or reuses) a scan of Sent mail. Resolves when the identity is complete. */
export function refreshIdentity(): Promise<void> {
  loadConfigured();
  if (!discovery) {
    discovery = discoverSentFromAddresses()
      .catch(() => {
        // A failed scan leaves the configured addresses in place; the next call retries.
      })
      .then(() => {
        discovery = null;
      });
  }
  return discovery;
}

function refreshIfStale() {
  if (Date.now() - lastDiscovery > REFRESH_INTERVAL_MS) refreshIdentity();
}

/**
 * Whether `email` is one of the user's addresses. Synchronous so serializers can call it per
 * contact; addresses found by the Sent scan are included once the first scan has finished.
 */
export function isMyAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  if (configured.size === 0) loadConfigured();
  refreshIfStale();
  const lower = email.toLowerCase();
  return configured.has(lower) || discovered.has(lower);
}

/** Resolves once the first scan has finished, so callers can rely on `isMyAddress`. */
export async function identityReady(): Promise<void> {
  if (lastDiscovery === 0 || discovery) await refreshIdentity();
  else refreshIfStale();
}

export async function currentIdentity(): Promise<Identity> {
  await identityReady();
  return {
    accounts: accounts.slice(),
    addresses: [...new Set([...configured, ...discovered])].sort(),
  };
}

/** Addresses usable in SQL right now (configured, plus the last completed Sent scan). */
export function knownAddresses(): string[] {
  if (configured.size === 0) loadConfigured();
  refreshIfStale();
  return [...new Set([...configured, ...discovered])];
}

AccountStore.listen(() => {
  loadConfigured();
  refreshIdentity();
});

// Start scanning as soon as a consumer loads, so the first queries usually see the full set.
if (!AppEnv.inSpecMode()) refreshIdentity();
