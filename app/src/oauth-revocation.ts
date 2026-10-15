import KeyManager from './key-manager';
import { Account } from './flux/models/account';

// https://developers.google.com/identity/protocols/oauth2#tokenrevoke
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const REVOKE_TIMEOUT_MS = 5000;

/**
 * Asks Google to drop the OAuth grant backing `account`, so the refresh token
 * Mailspring destroys locally when an account is disconnected does not stay valid
 * at the provider.
 *
 * Revocation is grant-scoped, not token-scoped: Google withdraws the application's
 * authorization for that user and every token issued under it, which is why the
 * endpoint takes a token and no client id. All Mailspring installs present the same
 * client (GMAIL_CLIENT_ID in onboarding-constants.ts), so Google holds one grant per
 * user rather than one per install — disconnecting an account on one machine also
 * signs that account out of Mailspring on the user's other machines, where refreshes
 * then fail with invalid_grant. That cost is accepted on purpose: Google offers no
 * way to revoke one refresh token while sparing its siblings, and no way for a
 * client to tell whether another install still holds the grant.
 *
 * Gmail only. Microsoft has no comparable single-call revocation endpoint for the
 * delegated grants Mailspring holds.
 *
 * Always resolves. Disconnecting an account is a local operation the user has
 * already asked for, and an offline machine, a grant the user revoked from their
 * Google account page, and an expired token are indistinguishable here — all of
 * them answer with a rejection or a 400. None of those should stop a removal or
 * reach Sentry, so failures are logged and swallowed.
 */
export async function revokeOAuthGrant(account: Account) {
  if (account.provider !== 'gmail') return;

  try {
    // extractAndStoreAccountSecrets strips the refresh token before the account is
    // persisted, so it has to be read back out of the keychain.
    const { settings } = await KeyManager.insertAccountSecrets(account);
    if (!settings.refresh_token) return;

    const resp = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      body: `token=${encodeURIComponent(settings.refresh_token)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(
        `Could not revoke the OAuth grant for ${account.emailAddress}: ${resp.status} ${resp.statusText}`
      );
    }
  } catch (err) {
    console.warn(`Could not revoke the OAuth grant for ${account.emailAddress}.`, err);
  }
}
