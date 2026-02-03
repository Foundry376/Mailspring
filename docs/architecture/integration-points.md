# Integration Points

This document lists the external protocols and APIs that Mailspring integrates with, including authentication mechanisms and where they are used in the codebase (Electron frontend vs. C++ sync engine).

## Summary Table

| Integration      | Auth mechanism              | Data exchange                    | Where implemented |
|------------------|-----------------------------|----------------------------------|-------------------|
| IMAP             | Username/password, OAuth    | Fetch mail, folder list          | C++ (Mailsync)    |
| SMTP             | Username/password, OAuth   | Send mail                        | C++ (Mailsync)    |
| Gmail (OAuth)    | OAuth 2.0                   | Tokens for IMAP/SMTP + Gmail API | Frontend + C++    |
| Office 365       | OAuth 2.0                   | Tokens for Outlook IMAP/SMTP     | Frontend + C++    |
| CalDAV           | Username/password / OAuth  | Calendar events                  | C++ (Mailsync)    |
| CardDAV          | Username/password / OAuth  | Contacts / address books         | C++ (Mailsync)    |

---

## 1. IMAP

- **Purpose**: Fetch email, folder structure, and metadata (flags, labels).
- **Auth**: Username/password (STARTTLS or SSL), or OAuth 2.0 for providers that support it (e.g. Gmail, Outlook).
- **Where**: Implemented in the **C++ sync engine** (Mailspring-Sync). The Electron app does not speak IMAP directly.
- **Frontend touchpoints**: Account configuration (host/port/credentials) is collected in the onboarding flow; error strings for IMAP-related failures are localized in `app/src/mailsync-process.ts` (e.g. `ErrorGmailIMAPNotEnabled`, `ErrorConnection`). Local search over already-synced data may use `search-query-backend-imap.ts` for server-side search when available.

---

## 2. SMTP

- **Purpose**: Send email.
- **Auth**: Username/password or OAuth 2.0 (e.g. Gmail, O365).
- **Where**: Implemented in the **C++ sync engine**. Sending is triggered by the frontend via `Actions.queueTask(SendDraftTask(...))`; the sync engine performs the actual SMTP submission.
- **Frontend touchpoints**: SMTP server settings in onboarding; error strings in `mailsync-process.ts` (e.g. `ErrorInvalidRelaySMTP`, `ErrorYahooSendMessageSpamSuspected`, `ErrorSendMessageNotAllowed`).

---

## 3. Gmail OAuth

- **Purpose**: Obtain OAuth 2.0 tokens for Gmail (IMAP/SMTP and optional Gmail API–style access for contacts/calendar).
- **Auth**: OAuth 2.0 with client ID (and embedded client secret). PKCE-style flow with local redirect server.
- **Where**:
  - **Frontend**: `app/internal_packages/onboarding/lib/onboarding-constants.ts` defines `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_SCOPES` (mail, userinfo, contacts, calendar). `buildGmailAuthURL()` and `buildGmailAccountFromAuthResponse()` in `onboarding-helpers.ts`; OAuth sign-in UI in `oauth-signin-page.tsx` and `page-account-settings-gmail.tsx`. Local server port `LOCAL_SERVER_PORT` (12141) receives the OAuth callback.
  - **C++**: Sync engine uses the tokens (stored in account secrets) to authenticate IMAP/SMTP and any Gmail-specific APIs. Client ID/secret are passed from the frontend (e.g. via `mailsync-process.ts` / account configuration) when launching the sync process.
- **Provider quirks**: Error strings in `mailsync-process.ts` cover Gmail IMAP not enabled, bandwidth limits, too many simultaneous connections, and application-specific password requirements.

---

## 4. Office 365 / Outlook OAuth

- **Purpose**: OAuth 2.0 for Outlook/Office 365 (IMAP/SMTP and optionally calendar/contacts).
- **Auth**: OAuth 2.0; client ID in `onboarding-constants.ts` (`O365_CLIENT_ID`). Scopes include `user.read`, `offline_access`, contacts, calendars, and Outlook IMAP/SMTP scopes.
- **Where**: **Frontend** handles the OAuth flow and account creation (e.g. `page-account-settings-outlook.tsx`, `page-account-settings-o365.tsx`). **C++** uses the stored tokens for IMAP/SMTP and calendar/contacts where applicable.
- **Provider quirks**: `ErrorOutlookLoginViaWebBrowser` and `ErrorNeedsConnectToWebmail` in `mailsync-process.ts` for web-based login requirements.

---

## 5. CalDAV

- **Purpose**: Sync calendar events (iCal).
- **Auth**: Typically username/password or OAuth depending on provider.
- **Where**: Sync is implemented in the **C++ sync engine**. The frontend consumes synced data (e.g. calendar colors, events) and displays them; see `internal_packages/main-calendar` and plans under `plans/caldav-*.md`, `plans/calendar-feature-assessment.md`.

---

## 6. CardDAV

- **Purpose**: Sync contacts / address books (vCard).
- **Auth**: Typically username/password or OAuth.
- **Where**: Sync is implemented in the **C++ sync engine**. The frontend parses and displays contacts; e.g. `internal_packages/contacts/lib/ContactInfoMapping.ts` parses CardDAV VCard (v3/v4) into the shared contact format. Contact source can be `carddav` or `gpeople` (Google People). See `plans/carddav-*.md` for provider-specific plans.

---

## Provider-Specific Error Strings (Inventory)

The following localized error strings in `app/src/mailsync-process.ts` indicate provider- or protocol-specific handling and quirks:

| String key / topic                    | Provider / area      |
|--------------------------------------|----------------------|
| ErrorGmailIMAPNotEnabled              | Gmail                |
| ErrorGmailExceededBandwidthLimit     | Gmail                |
| ErrorGmailTooManySimultaneousConnections | Gmail            |
| ErrorGmailApplicationSpecificPasswordRequired | Gmail        |
| ErrorOutlookLoginViaWebBrowser       | Outlook              |
| ErrorNeedsConnectToWebmail            | Webmail (generic)    |
| ErrorYahooUnavailable                | Yahoo                |
| ErrorYahooSendMessageSpamSuspected    | Yahoo                |
| ErrorYahooSendMessageDailyLimitExceeded | Yahoo             |
| ErrorMobileMeMoved                    | MobileMe             |
| ErrorConnection, ErrorTLSNotAvailable, ErrorCertificate | TLS/connection |
| ErrorAuthentication, ErrorNoImplementedAuthMethods | Auth        |
| ErrorSendMessageNotAllowed, ErrorInvalidRelaySMTP | SMTP        |

These can be used as an inventory for support documentation and for prioritizing provider-specific testing.

---

## Configuration and Discovery

- **Provider server settings**: Many providers (IMAP/SMTP host, port, SSL) are preconfigured in `app/internal_packages/onboarding/lib/mailcore-provider-settings.json` and `mailspring-provider-settings.json`. The app uses domain/MX matching to suggest settings for known providers.
- **OAuth**: Configured in the frontend (`onboarding-constants.ts`); tokens are stored securely and passed to the sync engine via account secrets (KeyManager).

For build and runtime configuration (e.g. overriding OAuth client IDs via environment variables), see [technology-stack.md](technology-stack.md) and the code references above.
