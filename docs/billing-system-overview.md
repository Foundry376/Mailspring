# Billing System Overview

This document catalogs all billing-related code in Mailspring to support the migration from in-app billing modals/webviews to an external browser-based billing flow.

---

## Architecture Summary

The current billing flow is built around three layers:

1. **IdentityStore** (`app/src/flux/stores/identity-store.ts`) — the source of truth for the user's identity and subscription state.
2. **BillingModal** (`app/src/components/billing-modal.tsx`) — an Electron `<webview>` that loads the payment page inline.
3. **FeatureUsageStore** / **FeatureUsedUpModal** — quota enforcement that triggers upgrade prompts when free-tier limits are hit.

When a user clicks "Upgrade", the app fetches an SSO URL via `IdentityStore.fetchSingleSignOnURL('/payment?embedded=true')`, opens `BillingModal` with the URL in an Electron `<webview>`, and after payment, scrapes the DOM for a `#payment-success-data` element before calling `IdentityStore.fetchIdentity()` to refresh the subscription state.

---

## Key Files

### 1. Identity Store (Source of Truth)

**File:** `app/src/flux/stores/identity-store.ts`

- **`IIdentity` interface** (L15-31): The user object shape — `id`, `token`, `firstName`, `lastName`, `emailAddress`, `stripePlan`, `stripePlanEffective`, `featureUsage`.
- **`hasProFeatures()`** (L85-87): Returns `true` when `stripePlanEffective !== 'Basic'`. This is the primary gating check used throughout the app.
- **`fetchIdentity()`** (L220-243): `GET /api/me` on the identity server. Merges the response into the current identity and calls `saveIdentity()`.
- **`fetchSingleSignOnURL(path)`** (L169-218): `POST /api/login-link` to get a one-time SSO URL for `id.getmailspring.com`. Used by BillingModal, FeatureUsedUpModal, OpenIdentityPageButton, and EventedIFrame.
- **Polling** (L89-97): In the main window, fetches identity after 1 second and then every 10 minutes.
- **Storage**: Token is stored in the OS keychain via `KeyManager`. The rest of the identity is in `AppEnv.config` under key `'identity'`.

**For the new flow:** The `IIdentity` interface is where feature flags will be added. `fetchIdentity()` is what should be called when the app is foregrounded after the user returns from the external billing page.

### 2. Billing Modal (Webview-Based Payment)

**File:** `app/src/components/billing-modal.tsx`

- Loads `id.getmailspring.com/payment?embedded=true` in an Electron `<webview>` (via the `Webview` component).
- After load, executes JS in the webview to scrape `#payment-success-data` and listen for `#continue-btn` clicks.
- On success, calls `IdentityStore.fetchIdentity()` to refresh the plan, then `Actions.closeModal()`.
- Props: `upgradeUrl?: string`, `source?: string`.
- Dimensions: 412x540.

**Style:** `app/static/style/components/billing-modal.less`

**For the new flow:** This is the primary component to be replaced. Instead of opening a modal with a webview, the new path will call `shell.openExternal()` to open the billing page in the system browser.

### 3. Feature Used Up Modal (Upgrade Prompt)

**File:** `app/src/components/feature-used-up-modal.tsx`

- Shown when a user exhausts their free-tier quota for a feature.
- Pre-fetches SSO URL on mount (`IdentityStore.fetchSingleSignOnURL('/payment?embedded=true')`).
- The **"Upgrade" button** (L76) opens `BillingModal` with `source="feature-limit"`.
- Also links externally to `https://getmailspring.com/pro`.

**Style:** `app/static/style/components/feature-used-up-modal.less`

**For the new flow:** The "Upgrade" button handler (`onUpgrade`) is the key point to intercept. Under the feature flag, it should open the billing URL externally instead of opening BillingModal.

### 4. Feature Usage Store (Quota Enforcement)

**File:** `app/src/flux/stores/feature-usage-store.tsx`

- `isUsable(feature)` (L112): Checks `usedInPeriod < quota` from the identity's `featureUsage` map.
- `markUsedOrUpgrade(feature, lexicon)` (L120): If not usable, calls `displayUpgradeModal()`. Otherwise marks used.
- `displayUpgradeModal(feature, lexicon)` (L81): Opens `FeatureUsedUpModal` via `Actions.openModal()`. Returns a Promise that resolves/rejects based on whether the user upgraded (determined by re-checking `isUsable` when the modal closes).

**For the new flow:** The Promise-based flow in `displayUpgradeModal` currently resolves when the modal closes. In the new flow, the modal won't contain a webview — the user will be redirected to the browser. Resolution will need to come from the identity refresh triggered on app foreground.

### 5. Webview Component

**File:** `app/src/components/webview.tsx`

- Generic Electron `<webview>` wrapper used by BillingModal.
- Handles loading states, error states, retry, `did-finish-load` callbacks.
- Uses `partition="in-memory-only"` for session isolation.

**For the new flow:** Will no longer be needed for billing but is still used elsewhere.

### 6. Open Identity Page Button

**File:** `app/src/components/open-identity-page-button.tsx`

- A button that fetches an SSO URL and opens it in the **external browser** via `shell.openExternal`.
- Already uses the pattern we want for the new billing flow.
- Props: `path`, `label`, `source`, `campaign`.

**For the new flow:** This component is a reference implementation for how to open billing pages externally. The same pattern (fetch SSO URL, then `shell.openExternal`) should be used in the new billing flow.

---

## Entry Points (Where Users Trigger Billing Actions)

### Preferences > Subscription Tab

**File:** `app/internal_packages/preferences/lib/tabs/preferences-identity.tsx`

Three states:

| State | UI | Action |
|---|---|---|
| No identity | "Setup Mailspring ID" button | IPC `application:add-identity` |
| Basic plan | "Get Mailspring Pro" button (L234-241) | Opens `BillingModal` via `_onUpgrade` (L163) |
| Paid plan | "Manage Billing" button (L276-281) | Opens `/dashboard#billing` via `OpenIdentityPageButton` (already external) |

Also renders `ExploreMailspringPro` and `ExploreMailspringSmall` feature grids with a link to `https://getmailspring.com/pro`.

**Registered in:** `app/internal_packages/preferences/lib/main.tsx` (tabId: `'Subscription'`, order 3).

### Please-Subscribe Notification

**File:** `app/internal_packages/notifications/lib/items/please-subscribe-notif.tsx`

Triggers when:
- `stripePlan === 'Basic'` and user has >4 accounts
- `stripePlan !== stripePlanEffective` (billing failure)

Action: "Manage" button opens Preferences > Subscription tab.

### Onboarding Upsell

**File:** `app/internal_packages/onboarding/lib/page-initial-subscription.tsx`

- Shown during onboarding for non-Pro users (gated in `page-initial-preferences.tsx` L208-214 via `IdentityStore.hasProFeatures()`).
- Displays pricing and feature list. "Finish Setup" button closes onboarding.
- Does not directly trigger a purchase — tells users to upgrade from Preferences > Subscription.

### Feature Quota Exhaustion (Per-Feature Paywalls)

All of these trigger `FeatureUsedUpModal` which leads to `BillingModal`:

| Feature | File | Feature ID |
|---|---|---|
| Snooze | `internal_packages/thread-snooze/lib/snooze-store.ts` | `snooze` |
| Send Later | `internal_packages/send-later/lib/send-later-button.tsx` | `send-later` |
| Send Reminders | `internal_packages/send-reminders/lib/send-reminders-utils.ts` | `reminders` |
| Thread Sharing | `internal_packages/thread-sharing/lib/thread-sharing-popover.tsx` | `thread-sharing` |
| Contact Profiles | `internal_packages/participant-profile/lib/sidebar-participant-profile.tsx` | `contact-profiles` |
| Grammar Check | `internal_packages/composer-grammar-check/lib/grammar-check-store.ts` | `grammar-check` |
| Open/Link Tracking | `app/src/components/metadata-composer-toggle-button.tsx` | plugin-specific |
| Translation | `internal_packages/translation/lib/message-header.tsx` | `translation` |

### Email Body Link Interception

**File:** `app/src/components/evented-iframe.tsx` (L438+)

- If a link in an email body points to `id.getmailspring.com`, the click is intercepted and routed through `IdentityStore.fetchSingleSignOnURL()` before opening externally.

---

## Billing URLs

| URL | Purpose | Used By |
|---|---|---|
| `id.getmailspring.com/payment?embedded=true` | In-app payment (webview) | BillingModal, FeatureUsedUpModal |
| `id.getmailspring.com/dashboard#billing` | Manage billing (external) | PreferencesIdentity, OpenIdentityPageButton |
| `id.getmailspring.com/api/login-link` | Generate SSO URLs | IdentityStore.fetchSingleSignOnURL |
| `id.getmailspring.com/api/me` | Fetch/refresh identity | IdentityStore.fetchIdentity |
| `https://getmailspring.com/pro` | Marketing page (external) | FeatureUsedUpModal, PreferencesIdentity |

---

## Component Registration

`BillingModal`, `FeatureUsedUpModal`, `OpenIdentityPageButton`, and `Webview` are registered as lazy-loaded components in:
- `app/src/global/mailspring-component-kit.js`
- `app/src/global/mailspring-component-kit.d.ts`

---

## shell.openExternal Patterns

The app already uses `shell.openExternal` extensively (23 call sites). The billing-relevant ones are:

- **`open-identity-page-button.tsx`** (L49) — SSO URL opened externally. This is the reference pattern.
- **`feature-used-up-modal.tsx`** (L30) — Opens `getmailspring.com/pro` externally.
- **`window-event-handler.ts`** (L371) — Catch-all for `http:`, `https:`, `tel:` links.

---

## Migration Plan Considerations

### Feature Flag Gating

The `IIdentity` interface will need a new field (e.g., `featureFlags` or similar) returned from the backend. The feature flag check should be centralized — likely as a method on `IdentityStore` (e.g., `useExternalBilling()`).

### Points of Change

1. **`FeatureUsedUpModal.onUpgrade`** — Check flag, either open BillingModal (old) or `shell.openExternal` (new).
2. **`PreferencesIdentity._onUpgrade`** — Same branch for the "Get Mailspring Pro" button.
3. **`FeatureUsageStore.displayUpgradeModal`** — The Promise-based resolution flow may need reworking. Currently it resolves when `Actions.closeModal` fires and the feature becomes usable. In the new flow, resolution would come from `IdentityStore.fetchIdentity()` triggered on app foreground.
4. **App foreground listener** — New code needed to call `IdentityStore.fetchIdentity()` when the app window is focused/foregrounded. The 10-minute polling interval is too slow.

### What Stays the Same

- `IdentityStore.fetchIdentity()` — still the mechanism to refresh billing state.
- `IdentityStore.fetchSingleSignOnURL()` — still needed to generate authenticated URLs, just opened via `shell.openExternal` instead of webview.
- `OpenIdentityPageButton` — already works the right way (external browser).
- `FeatureUsageStore` quota logic — unchanged.
- All per-feature paywall call sites — unchanged; they call into `FeatureUsageStore` which handles the modal.

### What Can Eventually Be Removed (After Full Migration)

- `BillingModal` component and its styles.
- The `?embedded=true` URL path.
- DOM scraping logic (`#payment-success-data`, `#continue-btn`).
- Zoom factor workaround in BillingModal.
- The `Webview` component (if not used elsewhere).
