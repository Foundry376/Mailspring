# Open Tracking: Required Backend Changes

This document describes the server-side changes needed to support the new
opaque-token open-tracking pixel format introduced in the Electron client.

## Summary of Client-Side Changes

The client previously generated tracking-pixel URLs of the form:

```
https://link.getmailspring.com/open/<messageId>?me=<accountId>&recipient=<base64email>
```

The new format encodes all parameters into a single Base64url token in the URL
path, with a `.png` extension:

```
https://link.getmailspring.com/o/<token>.png
```

The `<img>` tag also no longer includes `width="0"`, `height="0"`,
`style="border:0; width:0; height:0;"`, `class="mailspring-open"`, or
`alt="Sent from Mailspring"`. It is now simply:

```html
<img alt="" src="https://link.getmailspring.com/o/<token>.png">
```

These changes make the tracking pixel significantly harder for email-client
blockers to detect by removing the most common heuristics they rely on
(zero-dimension attributes, query-string parameters, identifiable CSS classes).

## Token Format

The token is a **Base64url-encoded JSON object** (RFC 4648 §5) containing:

```json
{
  "messageId": "<headerMessageId>",
  "accountId": "<accountId>",
  "recipient": "<recipient-email>"   // optional, only present for per-recipient bodies
}
```

### Encoding (client side — already implemented)

```typescript
const json = JSON.stringify({ messageId, accountId, recipient });
const token = btoa(json)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
```

### Decoding (server side — needs implementation)

```python
# Python example
import base64, json

def decode_open_token(token: str) -> dict:
    # Restore standard Base64 from URL-safe variant
    padded = token.replace('-', '+').replace('_', '/')
    padded += '=' * (4 - len(padded) % 4) if len(padded) % 4 else ''
    return json.loads(base64.b64decode(padded))
```

```javascript
// Node.js example
function decodeOpenToken(token) {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}
```

```cpp
// C++ example (for Mailspring-Sync)
// 1. Replace '-' → '+' and '_' → '/'
// 2. Pad with '=' to multiple of 4
// 3. Standard Base64 decode
// 4. Parse resulting string as JSON
// 5. Extract "messageId", "accountId", "recipient" fields
```

## Required Server Changes

### 1. Add new route: `GET /o/:token.png`

Register a new route that handles requests to `/o/<token>.png`.

**Request flow:**
1. Strip the `.png` extension from the path parameter to get the raw token
2. Base64url-decode the token
3. Parse the resulting JSON to extract `messageId`, `accountId`, and
   (optionally) `recipient`
4. Record the open event exactly as the existing `/open/` route does —
   update the message metadata with a new entry in `open_data` and increment
   `open_count`
5. Return a `1×1 transparent PNG` with headers:
   - `Content-Type: image/png`
   - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
   - `Pragma: no-cache`

### 2. Keep the old `/open/` route (backward compatibility)

Emails already sent with the old URL format will continue to be opened by
recipients for weeks or months. The old `GET /open/:messageId` route **must
remain active** and continue to function as before.

### 3. Response image

The server should return a genuine 1×1 transparent PNG (not a GIF or empty
response). Some email clients only load resources that return valid image data
with a correct `Content-Type` header.

Minimal 1×1 transparent PNG (68 bytes, hex):

```
89504e47 0d0a1a0a 0000000d 49484452
00000001 00000001 08060000 001f15c4
89000000 0a494441 54789c62 60000000
02000100 e637e800 00000049 454e44ae
426082
```

### 4. Cache-busting headers

To ensure each open generates a unique server hit (especially important for
Gmail's image proxy which caches aggressively), the response should include
aggressive no-cache headers as listed above.

### 5. Error handling

If the token cannot be decoded (malformed Base64, invalid JSON, missing
required fields), the server should still return the 1×1 transparent PNG
with a 200 status code. Returning an error status would cause email clients
to show a broken-image icon in the recipient's email.

## Migration Notes

- **No database schema changes required.** The open-event data structure
  (`open_count`, `open_data` array with `timestamp` and `recipient` fields)
  remains identical.
- **Backward compatibility is preserved.** Old pixels (`/open/...?me=...`)
  continue to work. New pixels (`/o/...`) use the new route.
- **The `remove-tracking-pixels` plugin** has been updated to detect and
  strip both the old and new URL formats when viewing sent mail locally.

## Future Improvements

For even stronger evasion of blockers, the token could be encrypted with AES
using a server-side secret key rather than merely Base64-encoded. This would
prevent blockers from decoding the token to identify tracking metadata. The
decoding logic on the server would change from Base64 → JSON.parse to
AES-decrypt → JSON.parse, but the URL format (`/o/<token>.png`) would remain
the same.
