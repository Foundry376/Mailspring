# CardDAV Fix: vCard Parsing Error Handling

## Priority: Medium

## Problem

The current implementation silently ignores vCard parsing errors:

```cpp
auto contact = Contact::contactFromVCard(etag, account->id(), abId, vcardData);
if (contact == nullptr) {
    // Silently skipped - no logging, no retry, no partial data
    continue;
}
```

This means:
- Corrupt vCards cause contacts to disappear without explanation
- Parsing edge cases result in data loss
- No way to diagnose why contacts aren't syncing

## Current Behavior

1. Fetch vCard data from server
2. Parse vCard
3. If parsing fails → contact skipped silently
4. User sees missing contact with no indication why

## Desired Behavior

1. Fetch vCard data from server
2. Parse vCard with detailed error tracking
3. If parsing fails → log error, optionally store raw data
4. Provide diagnostic information for troubleshooting
5. Recover as much data as possible from malformed vCards

## Implementation Plan

### Phase 1: Add Error Logging

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
auto contact = Contact::contactFromVCard(etag, account->id(), abId, vcardData);
if (contact == nullptr) {
    logger->warn("Failed to parse vCard from {}: {}",
                 href,
                 getVCardParseError(vcardData));

    // Store raw data for debugging
    storeFailedVCard(account->id(), abId, href, vcardData);
    continue;
}
```

### Phase 2: Improve vCard Parser Resilience

**File: `mailsync/MailSync/Models/Contact.cpp`**

```cpp
shared_ptr<Contact> Contact::contactFromVCard(
    string etag, string accountId, string bookId, string vcardData
) {
    try {
        auto vcard = parseVCard(vcardData);
        if (!vcard) {
            throw VCardParseException("Failed to parse vCard structure");
        }

        auto contact = make_shared<Contact>(accountId, bookId);
        contact->setEtag(etag);

        // Required fields - fail if missing
        string uid = vcard->getProperty("UID");
        if (uid.empty()) {
            throw VCardParseException("Missing required UID property");
        }
        contact->setVcardUID(uid);

        // Optional fields - use defaults if missing or malformed
        try {
            contact->setName(parseFullName(vcard));
        } catch (const exception& e) {
            logger->debug("Failed to parse FN, using fallback: {}", e.what());
            contact->setName("Unknown");
        }

        try {
            contact->setEmails(parseEmails(vcard));
        } catch (const exception& e) {
            logger->debug("Failed to parse EMAIL: {}", e.what());
            contact->setEmails({});
        }

        // ... continue with other fields using try/catch blocks ...

        return contact;
    } catch (const VCardParseException& e) {
        logger->error("vCard parse error: {}", e.what());
        logger->debug("Raw vCard data:\n{}", vcardData);
        return nullptr;
    }
}
```

### Phase 3: Handle Common vCard Issues

```cpp
string normalizeVCard(string vcardData) {
    // Fix common issues before parsing

    // 1. Fix line folding issues
    vcardData = fixLineFolding(vcardData);

    // 2. Handle different line endings
    vcardData = normalizeLineEndings(vcardData);

    // 3. Fix encoding issues
    vcardData = fixEncodingIssues(vcardData);

    // 4. Handle missing VERSION
    if (vcardData.find("VERSION:") == string::npos) {
        // Insert VERSION:3.0 after BEGIN:VCARD
        vcardData = insertVersion(vcardData, "3.0");
    }

    return vcardData;
}

// Common fixes:

string fixLineFolding(string data) {
    // RFC 5322: Folded lines start with space/tab
    // Some servers don't fold correctly
    regex foldPattern("\r?\n[ \t]");
    return regex_replace(data, foldPattern, "");
}

string fixEncodingIssues(string data) {
    // Handle QUOTED-PRINTABLE soft line breaks
    regex qpContinuation("=\r?\n");
    data = regex_replace(data, qpContinuation, "");

    // Decode QUOTED-PRINTABLE
    // ... implementation ...

    return data;
}
```

### Phase 4: Store Failed vCards for Diagnosis

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::storeFailedVCard(
    string accountId, string bookId, string href, string vcardData
) {
    // Store in a special table for debugging
    json failedEntry = {
        {"accountId", accountId},
        {"bookId", bookId},
        {"href", href},
        {"vcardData", vcardData},
        {"timestamp", time(nullptr)},
        {"error", getLastParseError()}
    };

    store->saveFailedSync("vcard", failedEntry);
}

// Expose to UI for diagnostics
vector<json> DAVWorker::getFailedVCards(string accountId) {
    return store->getFailedSyncs("vcard", accountId);
}
```

### Phase 5: Retry Logic for Transient Failures

```cpp
shared_ptr<Contact> DAVWorker::fetchAndParseContact(
    string href, string abId, int retryCount = 0
) {
    try {
        auto vcardData = fetchVCard(href);
        auto contact = Contact::contactFromVCard(etag, account->id(), abId, vcardData);

        if (contact == nullptr && retryCount < 2) {
            // vCard might be corrupt, try re-fetching
            logger->info("vCard parse failed, retrying fetch...");
            return fetchAndParseContact(href, abId, retryCount + 1);
        }

        return contact;
    } catch (const SyncException& e) {
        if (retryCount < 2 && e.retryable) {
            return fetchAndParseContact(href, abId, retryCount + 1);
        }
        throw;
    }
}
```

### Phase 6: Partial Recovery

Try to extract useful data even from malformed vCards:

```cpp
shared_ptr<Contact> Contact::partialContactFromVCard(
    string etag, string accountId, string bookId, string vcardData
) {
    auto contact = make_shared<Contact>(accountId, bookId);
    contact->setEtag(etag);
    contact->setRawVCard(vcardData);  // Store raw data

    // Extract what we can using regex
    regex uidPattern("UID:(.+)");
    regex fnPattern("FN:(.+)");
    regex emailPattern("EMAIL[;:]([^\\s]+)");
    regex telPattern("TEL[;:]([^\\s]+)");

    smatch match;

    if (regex_search(vcardData, match, uidPattern)) {
        contact->setVcardUID(match[1].str());
    } else {
        // Generate fallback UID
        contact->setVcardUID(MailUtils::idRandomlyGenerated());
    }

    if (regex_search(vcardData, match, fnPattern)) {
        contact->setName(match[1].str());
    }

    // Extract all emails
    vector<string> emails;
    auto emailBegin = sregex_iterator(vcardData.begin(), vcardData.end(), emailPattern);
    auto emailEnd = sregex_iterator();
    for (auto i = emailBegin; i != emailEnd; ++i) {
        emails.push_back((*i)[1].str());
    }
    contact->setEmails(emails);

    contact->setParseError("Partial recovery from malformed vCard");

    return contact;
}
```

## Common vCard Issues to Handle

| Issue | Example | Fix |
|-------|---------|-----|
| Missing VERSION | No VERSION property | Default to 3.0 |
| Bad line folding | Lines not properly continued | Remove folding markers |
| Encoding issues | QUOTED-PRINTABLE not decoded | Decode before parsing |
| Invalid UTF-8 | Non-UTF8 bytes in data | Convert/sanitize encoding |
| Missing UID | No UID property | Generate from FN + EMAIL |
| Duplicate properties | Multiple FN lines | Take first/merge |
| Unknown X- properties | X-CUSTOM-FIELD | Ignore gracefully |

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/Models/Contact.cpp` | Add error handling, partial recovery |
| `mailsync/MailSync/DAVWorker.cpp` | Add logging, retry logic, failed storage |
| `mailsync/MailSync/VCardParser.cpp` | Add normalization, fix common issues |

## Testing

1. Valid vCard - verify parsed correctly
2. vCard missing UID - verify fallback UID generated
3. vCard with encoding issues - verify decoded properly
4. Completely malformed vCard - verify logged and tracked
5. Partial data extraction - verify emails/phones recovered
6. Retry on transient failure - verify retry works
