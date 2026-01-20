# Implementation Plan: Header-Based Email Unsubscribe (RFC 2369 / RFC 8058)

## Background: RFC Specifications

### RFC 2369 - List-Unsubscribe Header Format
```
List-Unsubscribe: <mailto:unsubscribe@example.com?subject=unsubscribe>, <https://example.com/unsubscribe/abc123>
```
- URIs enclosed in angle brackets `< >`
- Multiple URIs separated by commas
- Supports `mailto:` and `https:` schemes

### RFC 8058 - One-Click Unsubscribe
```
List-Unsubscribe: <https://example.com/unsubscribe/abc123>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
- Requires HTTPS URI (not mailto)
- Client sends HTTP POST with body: `List-Unsubscribe=One-Click`
- Content-Type: `application/x-www-form-urlencoded`

## Assumptions

1. **Message model will have two new attributes:**
   ```typescript
   listUnsubscribe: Attributes.String({
     modelKey: 'listUnsubscribe',
     jsonKey: 'hlistunsub',
     queryable: false,
   }),
   listUnsubscribePost: Attributes.String({
     modelKey: 'listUnsubscribePost',
     jsonKey: 'hlistunsubpost',
     queryable: false,
   }),
   ```

2. **Mailsync will provide the raw header values**

## Implementation Steps

### Step 1: Update Message Model
**File:** `app/src/flux/models/message.ts`

- Add `listUnsubscribe` attribute (non-queryable string)
- Add `listUnsubscribePost` attribute for RFC 8058 support
- Add TypeScript property declarations

### Step 2: Create Unsubscribe Service
**New file:** `app/internal_packages/list-unsubscribe/lib/unsubscribe-service.ts`

This service will handle:

1. **Header parsing** - Extract URIs from the `List-Unsubscribe` header
   ```typescript
   interface UnsubscribeOption {
     type: 'https' | 'http' | 'mailto';
     uri: string;
   }

   function parseListUnsubscribeHeader(header: string): UnsubscribeOption[]
   ```

2. **One-click unsubscribe** (RFC 8058) - Perform HTTPS POST
   ```typescript
   async function performOneClickUnsubscribe(url: string): Promise<{success: boolean, error?: string}>
   ```
   - POST to the HTTPS URL
   - Body: `List-Unsubscribe=One-Click`
   - Content-Type: `application/x-www-form-urlencoded`
   - No cookies/credentials
   - Handle response codes (2xx = success)

3. **Mailto unsubscribe** - Open compose window with pre-filled email
   ```typescript
   async function performMailtoUnsubscribe(mailtoUri: string): Promise<void>
   ```
   - Use `DraftFactory.createDraftForMailto()` to create draft
   - Auto-populate to/subject from mailto URI
   - Open composer window

4. **Web unsubscribe** - Open browser (fallback)
   ```typescript
   function performWebUnsubscribe(url: string): void
   ```
   - Use `shell.openExternal()` for non-one-click HTTPS links

### Step 3: Update Unsubscribe UI Component
**File:** `app/internal_packages/list-unsubscribe/lib/unsubscribe-header.tsx`

Enhance to support multiple unsubscribe methods:

1. **Priority logic for determining best unsubscribe method:**
   - RFC 8058 one-click HTTPS (if `List-Unsubscribe-Post` present) → Highest priority
   - Mailto URI → Medium priority (composes email)
   - Regular HTTPS link → Low priority (opens browser)
   - Body-parsed link → Fallback (current behavior)

2. **UI states:**
   - Default: "Unsubscribe" link
   - Loading: "Unsubscribing..." with spinner (for one-click)
   - Success: "Unsubscribed" confirmation
   - Error: "Failed - try again" or fallback to browser

3. **User feedback:**
   - For one-click: Show inline confirmation/error (no user confirmation required)
   - For mailto: Open composer (user reviews before sending)
   - For web: Opens in browser

### Step 4: Update Main Plugin Logic
**File:** `app/internal_packages/list-unsubscribe/lib/main.tsx`

Modify `UnsubscribeHeaderContainer` to:

1. Check for header-based unsubscribe first (`message.listUnsubscribe`)
2. Fall back to body-parsed links if no header
3. Pass unsubscribe options to the UI component

### Step 5: Add Localization Strings
**Files:** `app/lang/*.json`

Add new strings for UI states.

### Step 6: Update Styles
**File:** `app/internal_packages/list-unsubscribe/styles/unsubscribe.less`

- Loading spinner styles
- Success/error state colors

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Message                                  │
│  listUnsubscribe: "<mailto:...>, <https://...>"                 │
│  listUnsubscribePost: "List-Unsubscribe=One-Click"              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UnsubscribeService                            │
│  parseListUnsubscribeHeader() → UnsubscribeOption[]             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 UnsubscribeHeaderContainer                       │
│  Determines best option, passes to UI                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UnsubscribeHeader (UI)                        │
│  Renders link, handles click → calls appropriate method         │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │ One-Click  │   │   Mailto   │   │    Web     │
     │ HTTP POST  │   │  Composer  │   │  Browser   │
     └────────────┘   └────────────┘   └────────────┘
```

## Security Considerations

1. **HTTPS only for one-click** - Never POST to HTTP URLs
2. **No credentials** - Don't send cookies with one-click requests
3. **Validate URI schemes** - Only allow `mailto:`, `http:`, `https:`
4. **Sanitize mailto URIs** - Prevent injection attacks in subject/body
5. **User confirmation for mailto** - Show composer instead of auto-sending

## Design Decisions

1. **One-click unsubscribe does NOT require user confirmation** - Clicking "Unsubscribe" immediately sends the POST request
2. **Mailto unsubscribe opens the composer** - Users review and explicitly send the unsubscribe email
3. **Header-based unsubscribe takes priority over body-parsed links** - More reliable and standardized
