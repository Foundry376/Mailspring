# Grammar Check Backend — Research & Development Instructions

## Goal

Build and deploy a private LanguageTool grammar-checking service that:

1. Runs the official LanguageTool Docker image in a private deployment
2. Is **not** exposed directly to the internet
3. Is fronted by an **API proxy** that authenticates requests with a secret API key
4. Receives proxied requests from the Mailspring desktop client via the proxy

```
┌──────────────┐        HTTPS + API key        ┌──────────────┐       HTTP (internal)      ┌─────────────────┐
│  Mailspring   │ ───────────────────────────▶  │  API Proxy    │ ─────────────────────────▶ │  LanguageTool    │
│  Desktop App  │                               │  (auth layer) │                            │  Docker (8010)   │
└──────────────┘                                └──────────────┘                             └─────────────────┘
```

---

## Table of Contents

- [Part 1: LanguageTool Docker Deployment](#part-1-languagetool-docker-deployment)
- [Part 2: API Proxy with Authentication](#part-2-api-proxy-with-authentication)
- [Part 3: LanguageTool API Reference](#part-3-languagetool-api-reference)
- [Part 4: Client Contract](#part-4-client-contract)
- [Part 5: Testing](#part-5-testing)
- [Part 6: Production Deployment](#part-6-production-deployment)

---

## Part 1: LanguageTool Docker Deployment

### Official Docker Image

The official community Docker image is `erikvl87/languagetool`. It bundles the LanguageTool Java server and exposes the HTTP API on port 8010.

```bash
# Minimal deployment (good for development, ~1GB RAM)
docker run -d \
  --name languagetool \
  --restart unless-stopped \
  -p 127.0.0.1:8010:8010 \
  erikvl87/languagetool

# With n-gram data for better error detection (recommended for production)
# n-gram data significantly improves detection of confusion pairs
# (e.g., "their" vs "there") but requires ~8GB disk and ~4GB RAM
docker run -d \
  --name languagetool \
  --restart unless-stopped \
  -p 127.0.0.1:8010:8010 \
  -v /data/ngrams:/ngrams \
  -e langtool_languageModel=/ngrams \
  erikvl87/languagetool
```

**Critical: Bind to 127.0.0.1 only.** The LanguageTool HTTP API has no authentication. It must never be exposed to the public internet directly. The proxy provides the auth layer.

### n-gram Data Setup

n-gram data must be downloaded separately from LanguageTool's website. The files are large (~8GB total for English):

```bash
mkdir -p /data/ngrams
cd /data/ngrams

# Download n-gram data for English (other languages available too)
wget https://languagetool.org/download/ngram-data/ngrams-en-20150817.zip
unzip ngrams-en-20150817.zip

# The directory structure should be:
# /data/ngrams/en/
#   1grams/
#   2grams/
#   3grams/
```

### Docker Compose (Recommended)

The proxy and LanguageTool should be deployed together. Here is the target `docker-compose.yml` structure:

```yaml
version: "3.8"

services:
  languagetool:
    image: erikvl87/languagetool
    restart: unless-stopped
    # Only accessible from within the Docker network — not exposed to host
    expose:
      - "8010"
    volumes:
      - ./ngrams:/ngrams
    environment:
      - langtool_languageModel=/ngrams
      # Optional: increase Java heap for large n-gram data
      - Java_Xms=512m
      - Java_Xmx=2g
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8010/v2/languages"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  proxy:
    build: ./proxy
    restart: unless-stopped
    ports:
      - "443:443"    # or whatever port you expose
    environment:
      - LANGUAGETOOL_URL=http://languagetool:8010
      - API_KEY=${GRAMMAR_API_KEY}
    depends_on:
      languagetool:
        condition: service_healthy
```

### LanguageTool Configuration Options

The Docker image accepts environment variables prefixed with `langtool_`:

| Environment Variable | Description | Default |
|---|---|---|
| `langtool_languageModel` | Path to n-gram data directory | (none) |
| `Java_Xms` | JVM initial heap size | `256m` |
| `Java_Xmx` | JVM max heap size | `512m` |
| `langtool_fasttextModel` | Path to fastText language detection model | (none) |
| `langtool_fasttextBinary` | Path to fastText binary | (none) |
| `langtool_maxTextLength` | Maximum text length per request (chars) | `50000` |
| `langtool_maxCheckTimeMillis` | Maximum check time per request | `10000` |

For production, set `Java_Xmx=2g` minimum if using n-gram data.

### Startup Verification

After starting LanguageTool, verify it's running:

```bash
# Check the languages endpoint (lightweight, good for healthcheck)
curl http://localhost:8010/v2/languages | head -c 200

# Run a test check
curl -X POST http://localhost:8010/v2/check \
  -d "text=He do not like bananas.&language=en-US"
```

Expected: JSON response with a match for "do" → "does" (subject-verb agreement).

---

## Part 2: API Proxy with Authentication

### Requirements

The proxy must:

1. **Authenticate** every request using a secret API key passed in the `Authorization` header (Bearer token) or a custom `X-Api-Key` header
2. **Forward** authenticated requests to the internal LanguageTool instance
3. **Reject** unauthenticated requests with `401 Unauthorized`
4. **Proxy only the endpoints the client needs** — allowlist, not blocklist
5. **Track usage per API key** using the `draftId` parameter (see [Usage Tracking](#usage-tracking) below)
6. **Return `402 Payment Required`** when usage quota is exceeded
7. **Enforce rate limiting** per API key to prevent abuse
8. **Add CORS headers** for Electron (the Mailspring client makes fetch requests from a `file://` or `mailspring://` origin)
9. **Strip the auth header and `draftId` param** before forwarding to LanguageTool (LanguageTool doesn't understand them)
10. **Log** request metadata (timestamp, endpoint, response time, text length) but **never log the request body text** (privacy)

### Endpoints to Proxy

Only these LanguageTool endpoints need to be exposed through the proxy:

| Method | Path | Purpose | Rate Limit |
|---|---|---|---|
| `POST` | `/v2/check` | Check text for grammar errors | 30 req/min per key |
| `GET` | `/v2/languages` | List supported languages | 10 req/min per key |

All other paths should return `404 Not Found`.

### Authentication Scheme

The client sends the API key as a Bearer token:

```
POST /v2/check HTTP/1.1
Host: grammar.example.com
Authorization: Bearer <secret-api-key>
Content-Type: application/x-www-form-urlencoded

text=He+do+not+like+bananas.&language=auto
```

Or via custom header (support both):

```
X-Api-Key: <secret-api-key>
```

The proxy validates the key against the `API_KEY` environment variable (or a list of valid keys if multi-tenant). On success, strip the auth headers and forward the request body as-is to `http://languagetool:8010/v2/check`.

### Proxy Implementation Notes

The proxy is intentionally simple. It performs two transformations on `POST /v2/check` requests:
1. **Strips the `draftId` parameter** from the form body (LanguageTool doesn't understand it)
2. **Strips `Authorization` / `X-Api-Key` headers**

Otherwise, the request body is forwarded as-is to LanguageTool, and the JSON response is returned as-is to the client.

**Request flow for `POST /v2/check`:**

```
1. Client sends POST /v2/check with Authorization header + form body (includes draftId)
2. Proxy validates Authorization header
3. Proxy extracts draftId from form body for usage tracking
4. Proxy checks usage quota — if exceeded, return 402 immediately
5. If new draftId, increment usage counter and record draftId
6. Proxy strips Authorization / X-Api-Key headers and draftId param from form body
7. Proxy forwards POST to http://languagetool:8010/v2/check with cleaned body
8. LanguageTool returns JSON response
9. Proxy adds CORS headers and returns JSON response to client
```

**CORS headers to add:**

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Authorization, X-Api-Key, Content-Type
Access-Control-Max-Age: 86400
```

Note: `Access-Control-Allow-Origin: *` is acceptable here because authentication is handled via the API key, not cookies. The Electron client may send requests from various origins depending on the window type.

**Handle OPTIONS preflight:**

The proxy must respond to `OPTIONS` requests on all proxied paths with a `204 No Content` and the CORS headers above. Electron's `fetch()` may send preflight requests depending on the headers used.

### Rate Limiting

Implement token-bucket or sliding-window rate limiting keyed on the API key value. Suggested limits:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /v2/check` | 30 requests | per minute |
| `GET /v2/languages` | 10 requests | per minute |

Return `429 Too Many Requests` with a `Retry-After` header (in seconds) when the limit is exceeded.

### Usage Tracking

The proxy tracks grammar check usage **per API key, per billing period** to enforce subscription quotas. Usage is counted once per unique `draftId` — multiple check requests for the same draft (as the user edits different paragraphs) count as a single usage.

**How it works:**

1. The client sends a `draftId` parameter in every `POST /v2/check` request body. This is the Mailspring draft's `headerMessageId`, a stable identifier for the lifetime of a draft.
2. On each `POST /v2/check` request, the proxy:
   - Extracts the `draftId` from the form body
   - Checks if this `draftId` has been seen before for this API key in the current billing period
   - If **new `draftId`**: increments the usage counter, records the `draftId`, and forwards the request
   - If **seen `draftId`**: forwards the request without incrementing (already counted)
   - If **usage quota exceeded**: returns `402 Payment Required` immediately without forwarding
3. The proxy strips the `draftId` parameter from the form body before forwarding to LanguageTool (LanguageTool does not understand this parameter).

**Usage exceeded response:**

```
HTTP/1.1 402 Payment Required
Content-Type: application/json
Access-Control-Allow-Origin: *

{
  "error": "usage_exceeded",
  "message": "Grammar check usage limit reached for this billing period"
}
```

**The client handles this by:**
- Setting a `usageExceeded` flag in the grammar check store
- Stopping all further grammar check API calls for the session
- Displaying a small warning banner in the composer: "Grammar check is disabled — usage limit reached for this billing period."
- Switching the toolbar icon to a warning state

**`draftId` characteristics:**
- Format: opaque string (Mailspring uses a UUID-based `headerMessageId` like `<draft-abc123@mailspring.com>`)
- Lifetime: exists from when the user starts composing until they send or discard the draft
- Uniqueness: each new compose/reply/forward creates a new `draftId`
- A typical email session might produce 1–10 unique draft IDs

**Storage requirements:**
- The proxy needs to store `(api_key, draftId)` pairs for the current billing period
- At the end of each billing period, the set of seen draft IDs can be cleared
- Typical storage: a few hundred entries per API key per month

**Implementation example (pseudocode):**

```
function handleCheck(req):
  apiKey = extractApiKey(req)
  if not isValidApiKey(apiKey):
    return 401

  formBody = parseFormBody(req.body)
  draftId = formBody.get("draftId")

  # Check and update usage
  if draftId and not hasSeenDraft(apiKey, draftId):
    if getUsageCount(apiKey) >= getQuota(apiKey):
      return 402, {"error": "usage_exceeded", ...}
    incrementUsage(apiKey)
    recordDraftId(apiKey, draftId)

  # Strip proxy-specific params before forwarding
  formBody.delete("draftId")
  return forwardToLanguageTool(formBody)
```

### Health Check Endpoint

Expose an unauthenticated `GET /health` endpoint that checks the proxy can reach LanguageTool:

```json
// GET /health → 200 OK
{
  "status": "ok",
  "languagetool": "reachable",
  "version": "6.4"
}

// GET /health → 503 Service Unavailable
{
  "status": "error",
  "languagetool": "unreachable"
}
```

Implementation: proxy makes a `GET /v2/languages` call to LanguageTool internally. If it responds, report healthy. Cache the result for 30 seconds.

### Error Handling

| Scenario | Proxy Response |
|---|---|
| Missing or invalid API key | `401 Unauthorized` with `{"error": "Invalid or missing API key"}` |
| Usage quota exceeded | `402 Payment Required` with `{"error": "usage_exceeded", "message": "Grammar check usage limit reached for this billing period"}` |
| Rate limit exceeded | `429 Too Many Requests` with `Retry-After` header |
| LanguageTool unreachable | `502 Bad Gateway` with `{"error": "Grammar check service unavailable"}` |
| LanguageTool returns 4xx | Forward the status code and body as-is |
| LanguageTool returns 5xx | `502 Bad Gateway` with `{"error": "Grammar check service error"}` |
| Request body too large (>100KB) | `413 Payload Too Large` |
| Unsupported endpoint | `404 Not Found` |
| OPTIONS preflight | `204 No Content` with CORS headers |

---

## Part 3: LanguageTool API Reference

This is the complete API reference for the endpoints the proxy needs to forward. The proxy does not need to parse or transform these payloads — this reference is provided so you understand what the client sends and what LanguageTool returns, which is essential for writing tests and debugging.

### POST /v2/check — Grammar Check

The primary endpoint. The client calls this for every paragraph the user edits (debounced at 800ms after typing stops).

**Request** (`Content-Type: application/x-www-form-urlencoded`):

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | **Yes**\* | The text to check. \*Either `text` or `data` is required. Our client always uses `text`. |
| `data` | string | No | Alternative: JSON document with text and markup annotations. Not used by our client. |
| `language` | string | **Yes** | Language code: `en-US`, `de-DE`, `fr`, or `auto` for auto-detection. Our client defaults to `auto`. |
| `motherTongue` | string | No | User's native language code. Enables false-friends detection (e.g., German user writing English). |
| `preferredVariants` | string | No | Comma-separated preferred variants when `language=auto`. E.g., `en-US,de-DE` to prefer US English over British. |
| `enabledRules` | string | No | Comma-separated rule IDs to enable. |
| `disabledRules` | string | No | Comma-separated rule IDs to disable. Used for dismissed rules. E.g., `HE_VERB_AGR,EN_QUOTES`. |
| `enabledCategories` | string | No | Comma-separated category IDs to enable. |
| `disabledCategories` | string | No | Comma-separated category IDs to disable. |
| `enabledOnly` | boolean | No | Default `false`. If `true`, only explicitly enabled rules/categories are checked. |
| `level` | string | No | `"default"` or `"picky"`. Picky mode enables additional rules for formal writing. |
| `username` | string | No | For premium API access. Not used by our client. |
| `apiKey` | string | No | LanguageTool's own API key for premium. **Not to be confused with our proxy's auth key.** Not used by our client. |
| `dicts` | string | No | Comma-separated list of user dictionary IDs. Not used by our client. |
| `draftId` | string | **Yes**\*\* | **Proxy-only parameter.** The Mailspring draft ID (`headerMessageId`). Used by the proxy for per-draft usage tracking. \*\*Required by the proxy, not part of the LanguageTool API. The proxy must strip this before forwarding to LanguageTool. |

**Typical request from our Mailspring client:**

```
POST /v2/check
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <proxy-api-key>

text=He+do+not+like+bananas.&language=auto&draftId=%3Cdraft-abc123%40mailspring.com%3E&disabledRules=WHITESPACE_RULE%2CEN_QUOTES
```

Note: The `Authorization` header and `draftId` parameter are for the proxy only. The proxy strips both before forwarding to LanguageTool. The `apiKey` form body param is LanguageTool's own premium key field and is not used by our client.

**Response** (`200 OK`, `Content-Type: application/json`):

```typescript
interface LanguageToolResponse {
  software: {
    name: string;           // "LanguageTool"
    version: string;        // "6.4"
    buildDate: string;      // "2024-06-25 10:45:00 +0000"
    apiVersion: number;     // 1
    status: string;         // ""
    premium: boolean;       // false (for self-hosted)
  };

  language: {
    name: string;           // "English (US)"
    code: string;           // "en-US"
    detectedLanguage: {
      name: string;         // "English (US)"
      code: string;         // "en-US"
      confidence?: number;  // 0.99 (often present but not in spec)
    };
  };

  matches: LanguageToolMatch[];
}

interface LanguageToolMatch {
  message: string;          // Full description, e.g., "The verb 'do' does not agree..."
  shortMessage: string;     // Brief label, e.g., "Subject-verb agreement" (may be "")
  offset: number;           // Character offset in submitted text (0-based)
  length: number;           // Number of characters in error span
  replacements: Array<{
    value: string;          // Suggested replacement, e.g., "does"
  }>;
  context: {
    text: string;           // Surrounding text snippet for display
    offset: number;         // Offset of error within context.text
    length: number;         // Length of error within context.text
  };
  sentence: string;         // Full sentence containing the error
  rule: {
    id: string;             // Rule identifier, e.g., "HE_VERB_AGR"
    subId?: string;         // Sub-rule ID (optional)
    description: string;    // Rule description, e.g., "'He/she' + verb agreement"
    issueType: string;      // "grammar", "typographical", "misspelling", "style", etc.
    category: {
      id: string;           // "GRAMMAR", "TYPOS", "STYLE", "PUNCTUATION", "REDUNDANCY", "CASING"
      name: string;         // "Grammar", "Possible Typo", etc.
    };
    urls?: Array<{
      value: string;        // URL to rule documentation
    }>;
  };
}
```

**Example response:**

```json
{
  "software": {
    "name": "LanguageTool",
    "version": "6.4",
    "buildDate": "2024-06-25 10:45:00 +0000",
    "apiVersion": 1,
    "status": "",
    "premium": false
  },
  "language": {
    "name": "English (US)",
    "code": "en-US",
    "detectedLanguage": {
      "name": "English (US)",
      "code": "en-US"
    }
  },
  "matches": [
    {
      "message": "The verb 'do' does not agree with the subject 'He'. Consider using: \"does\"",
      "shortMessage": "Subject-verb agreement",
      "offset": 3,
      "length": 2,
      "replacements": [
        { "value": "does" },
        { "value": "did" }
      ],
      "context": {
        "text": "He do not like bananas.",
        "offset": 3,
        "length": 2
      },
      "sentence": "He do not like bananas.",
      "rule": {
        "id": "HE_VERB_AGR",
        "description": "'He/she' + verb agreement",
        "issueType": "grammar",
        "category": {
          "id": "GRAMMAR",
          "name": "Grammar"
        }
      }
    }
  ]
}
```

### GET /v2/languages — Supported Languages

Returns the list of languages supported by this LanguageTool instance. The client uses this to populate a language dropdown in preferences.

**Request:** No parameters.

**Response** (`200 OK`, `Content-Type: application/json`):

```typescript
type LanguageToolLanguagesResponse = Array<{
  name: string;     // "English (US)"
  code: string;     // "en"
  longCode: string; // "en-US"
}>;
```

**Example response (abbreviated):**

```json
[
  { "name": "Arabic", "code": "ar", "longCode": "ar" },
  { "name": "English (US)", "code": "en", "longCode": "en-US" },
  { "name": "English (GB)", "code": "en", "longCode": "en-GB" },
  { "name": "French", "code": "fr", "longCode": "fr" },
  { "name": "German (Germany)", "code": "de", "longCode": "de-DE" },
  { "name": "Spanish", "code": "es", "longCode": "es" }
]
```

### LanguageTool Error Responses

When LanguageTool itself returns errors (as opposed to proxy errors):

| Status | Meaning | Example Body |
|---|---|---|
| `400` | Bad request (e.g., missing `language` param) | `{"message": "Error: Missing 'language' parameter"}` |
| `413` | Text exceeds `maxTextLength` | `{"message": "Error: Text too long (limit: 50000 characters)"}` |
| `500` | Internal server error | `{"message": "Error: ..."}` |

These should be forwarded as-is through the proxy (the proxy does not need to reformat them).

---

## Part 4: Client Contract

The Mailspring client (`grammar-check-service.ts`) is already implemented. Here is exactly what it does so the proxy can be designed to match.

### How the Client Sends Requests

```typescript
// From grammar-check-service.ts in the Mailspring repo
const params = new URLSearchParams();
params.append('text', text);
params.append('language', language || this.language);  // default: 'auto'
params.append('draftId', draftId);  // Mailspring draft headerMessageId

if (this.level && this.level !== 'default') {
  params.append('level', this.level);
}
if (this.preferredVariants) {
  params.append('preferredVariants', this.preferredVariants);
}
if (this.motherTongue) {
  params.append('motherTongue', this.motherTongue);
}
if (this.disabledRules.length > 0) {
  params.append('disabledRules', this.disabledRules.join(','));
}
if (this.disabledCategories.length > 0) {
  params.append('disabledCategories', this.disabledCategories.join(','));
}

const headers: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded',
};
if (this.apiKey) {
  headers['Authorization'] = `Bearer ${this.apiKey}`;
}

const response = await fetch(`${this.serverUrl}/v2/check`, {
  method: 'POST',
  headers,
  body: params.toString(),
  signal,  // AbortSignal for cancellation
});

// Client checks for 402 before parsing response
if (response.status === 402) {
  throw new UsageExceededError();  // Store catches this and stops checking
}
```

### Authentication and draftId

The `apiKey` config field is sent as an `Authorization: Bearer <key>` header (not as a form body parameter). The proxy should also accept the key via `X-Api-Key` header as a fallback.

The `draftId` is always sent as a form body parameter. When no `apiKey` is configured (direct LanguageTool connection), no `Authorization` header is sent, and the `draftId` is harmlessly ignored by LanguageTool (unknown form params are silently discarded).

This way the same client code works for both:
- **Direct LanguageTool** → no `apiKey`, no auth header, `draftId` ignored
- **Authenticated proxy** → `apiKey` = proxy secret as Bearer token, `draftId` used for usage tracking

### Request Characteristics

Things the proxy should expect from the client:

- **Request frequency:** Roughly one `POST /v2/check` per paragraph edit, debounced at 800ms. A typical email draft might generate 3–15 check requests during composition.
- **Request body size:** Usually small — one paragraph of text, typically 50–500 characters. Maximum practical size is about 10KB (a very long paragraph).
- **Concurrency:** One request in flight per draft. If the user edits while a check is pending, the client aborts the in-flight request (via `AbortSignal`) and sends a new one.
- **`GET /v2/languages`:** Called once when the preferences panel is opened. Very infrequent.

---

## Part 5: Testing

### Test Cases for the Proxy

**Authentication tests:**

```bash
# Should succeed with valid API key (Bearer)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=He+do+not+like+bananas.&language=en-US"
# Expected: 200

# Should succeed with valid API key (X-Api-Key)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "X-Api-Key: ${API_KEY}" \
  -d "text=He+do+not+like+bananas.&language=en-US"
# Expected: 200

# Should fail with no API key
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -d "text=He+do+not+like+bananas.&language=en-US"
# Expected: 401

# Should fail with wrong API key
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer wrong-key" \
  -d "text=He+do+not+like+bananas.&language=en-US"
# Expected: 401
```

**Proxy forwarding tests:**

```bash
# Should return grammar errors for bad text
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=He+do+not+like+bananas.&language=en-US" | jq '.matches | length'
# Expected: 1 (or more)

# Should return no errors for correct text
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=He+does+not+like+bananas.&language=en-US" | jq '.matches | length'
# Expected: 0

# Should return languages list
curl -s \
  https://grammar.example.com/v2/languages \
  -H "Authorization: Bearer ${API_KEY}" | jq 'length'
# Expected: > 20

# Should support auto language detection
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=Er+haben+nicht+gern+Bananen.&language=auto" | jq '.language.detectedLanguage.code'
# Expected: "de-DE" or similar German variant

# Should support disabledRules passthrough
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=He+do+not+like+bananas.&language=en-US&disabledRules=HE_VERB_AGR" | jq '.matches | length'
# Expected: 0 (the rule that would match is disabled)

# Should support picky level
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=This+is+a+totally+great+sentence.&language=en-US&level=picky" | jq '.matches | length'
# Expected: possibly > 0 (picky mode catches more style issues)
```

**CORS tests:**

```bash
# Preflight should succeed without auth
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS https://grammar.example.com/v2/check \
  -H "Origin: file://" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
# Expected: 204

# Response should include CORS headers
curl -s -D - \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=Test.&language=en-US" | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: *
```

**Usage tracking tests:**

```bash
# First request with a new draftId should succeed and count as 1 usage
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=He+do+not+like+bananas.&language=en-US&draftId=draft-test-001"
# Expected: 200

# Second request with the SAME draftId should succeed without incrementing usage
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "text=Another+paragraph+in+same+draft.&language=en-US&draftId=draft-test-001"
# Expected: 200 (usage count still 1)

# Request after quota is exhausted should return 402
# (set up a test API key with quota=1 to verify)
curl -s \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${LIMITED_API_KEY}" \
  -d "text=Test.&language=en-US&draftId=draft-over-quota"
# Expected: 402 with {"error": "usage_exceeded", ...}
```

**Error handling tests:**

```bash
# Should return 404 for unknown paths
curl -s -o /dev/null -w "%{http_code}" \
  https://grammar.example.com/v2/words \
  -H "Authorization: Bearer ${API_KEY}"
# Expected: 404

# Should return 413 for oversized body
python3 -c "print('text=' + 'a' * 200000 + '&language=en-US')" | \
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://grammar.example.com/v2/check \
  -H "Authorization: Bearer ${API_KEY}" \
  -d @-
# Expected: 413

# Health endpoint should work without auth
curl -s https://grammar.example.com/health | jq '.status'
# Expected: "ok"
```

### Test Texts for Grammar Checking

Use these known-bad texts to verify LanguageTool is working correctly:

| Input Text | Expected Rule ID | Expected Category | Expected Replacement |
|---|---|---|---|
| `He do not like bananas.` | `HE_VERB_AGR` | `GRAMMAR` | `does` |
| `I can't remeber the name.` | `MORFOLOGIK_RULE_EN_US` | `TYPOS` | `remember` |
| `This is a sentence without a period` | `SENTENCE_WHITESPACE` or similar | `PUNCTUATION` | (add period) |
| `Their going to the store.` | `THEIR_IS` | `GRAMMAR` | `They're` |
| `I would of gone.` | `WOULD_OF` | `GRAMMAR` | `would have` |
| `She is more taller than him.` | `COMPARATIVE_DOUBLE` | `GRAMMAR` | `taller` |
| `the united states is a country.` | `UPPERCASE_SENTENCE_START` | `CASING` | `The` |

---

## Part 6: Production Deployment

### Environment Variables

The proxy needs these environment variables:

| Variable | Required | Description |
|---|---|---|
| `LANGUAGETOOL_URL` | Yes | Internal URL of the LanguageTool instance (e.g., `http://languagetool:8010`) |
| `API_KEY` | Yes | The secret API key that clients must present. Generate with `openssl rand -hex 32`. |
| `PORT` | No | Port the proxy listens on (default: `8080`) |
| `MAX_BODY_SIZE` | No | Maximum request body size in bytes (default: `102400` = 100KB) |
| `RATE_LIMIT_CHECK` | No | Rate limit for POST /v2/check in requests/minute (default: `30`) |
| `RATE_LIMIT_LANGUAGES` | No | Rate limit for GET /v2/languages in requests/minute (default: `10`) |
| `USAGE_QUOTA` | No | Maximum unique draft IDs per API key per billing period (default: `50`) |
| `BILLING_PERIOD` | No | Billing period for usage tracking: `monthly` or `weekly` (default: `monthly`) |
| `USAGE_STORE_URL` | No | URL for external usage store (Redis, database). If not set, usage is tracked in-memory (lost on restart). |
| `LOG_LEVEL` | No | Logging verbosity: `debug`, `info`, `warn`, `error` (default: `info`) |

### Security Checklist

- [ ] LanguageTool container is NOT exposed to the public internet (only accessible within Docker network or via 127.0.0.1)
- [ ] Proxy requires valid API key on all endpoints except `/health` and `OPTIONS`
- [ ] API key is stored as an environment variable or secret, never hardcoded
- [ ] Proxy strips `Authorization` and `X-Api-Key` headers before forwarding to LanguageTool
- [ ] Request body text is never logged (privacy — it contains user email content)
- [ ] HTTPS is terminated at the proxy (or at a load balancer in front of it)
- [ ] Rate limiting is enforced per API key
- [ ] Body size limit prevents abuse (100KB default)
- [ ] Unknown paths return 404 (endpoint allowlist, not blocklist)
- [ ] Health endpoint does not leak internal network topology

### Monitoring

The proxy should log (at `info` level) for each request:

```
timestamp, method, path, status_code, response_time_ms, text_length, language
```

Example:
```
2026-02-17T10:30:00Z POST /v2/check 200 142ms len=87 lang=auto
2026-02-17T10:30:01Z POST /v2/check 200 98ms len=234 lang=en-US
2026-02-17T10:31:15Z GET /v2/languages 200 12ms
2026-02-17T10:31:20Z POST /v2/check 401 1ms (unauthorized)
```

Never log the `text` parameter value.

### Recommended Stack

The proxy is intentionally simple. Any of these would work:

- **Node.js + Express/Fastify** — if the team is JavaScript-native
- **Go + net/http** — minimal dependencies, single binary, excellent for Docker
- **Caddy/nginx** — if you want config-only (no code) with auth via plugins
- **Python + FastAPI** — quick to prototype

The proxy should be fewer than 200 lines of application code. It is a thin auth + rate-limit + forward layer, not a feature-rich API gateway.

### Client Configuration

Once deployed, users configure the Mailspring grammar check plugin with:

- **Server URL:** `https://grammar.example.com` (the proxy URL)
- **API Key:** the secret key (same value as the `API_KEY` env var on the proxy)

These are set in the Mailspring preferences under the Grammar Check tab, stored as:
- `core.composing.grammarCheckServerUrl`
- `core.composing.grammarCheckApiKey`
