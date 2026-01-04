# CardDAV Fix: Support Multiple Address Books

## Priority: Critical

## Problem

The current implementation only syncs ONE address book, ignoring all others:

```cpp
abSetContentsDoc->evaluateXPath("//D:response[.//carddav:addressbook]", ([&](xmlNodePtr node) {
    // ... creates/updates ONE address book ...
    // Loop continues but overwrites the same 'existing' variable!
}));

return existing;  // Returns only ONE address book
```

The code has a TODO comment acknowledging this:
```cpp
// TODO: Pick the primary one somehow!
```

Many users have multiple address books:
- Personal contacts
- Work contacts
- Shared/team address books
- Collected addresses (auto-added from email)

## Current Behavior

1. Find address book home set
2. Iterate over all address books found
3. **Only keep the last one found** (each iteration overwrites `existing`)
4. Sync only that one address book

## Desired Behavior

1. Find address book home set
2. Discover ALL address books
3. Create ContactBook model for each
4. Sync ALL address books
5. Clean up address books that no longer exist

## Implementation Plan

### Phase 1: Update resolveAddressBook to Return Multiple

**File: `mailsync/MailSync/DAVWorker.hpp`**

```cpp
// Change return type
vector<shared_ptr<ContactBook>> resolveAddressBooks();

// Keep for backwards compatibility during transition
shared_ptr<ContactBook> resolveAddressBook();
```

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
vector<shared_ptr<ContactBook>> DAVWorker::resolveAddressBooks() {
    vector<shared_ptr<ContactBook>> result;

    // ... existing DNS + .well-known discovery ...

    auto existingBooks = store->findAllMap<ContactBook>(
        Query().equal("accountId", account->id()), "id");

    abSetContentsDoc->evaluateXPath("//D:response[.//carddav:addressbook]", ([&](xmlNodePtr node) {
        string abHREF = abSetContentsDoc->nodeContentAtXPath(".//D:href/text()", node);
        string abURL = (abHREF.find("://") == string::npos) ? replacePath(abSetURL, abHREF) : abHREF;
        string displayName = abSetContentsDoc->nodeContentAtXPath(".//D:displayname/text()", node);
        string ctag = abSetContentsDoc->nodeContentAtXPath(".//cs:getctag/text()", node);

        // Generate unique ID based on URL
        string id = MailUtils::idForContactBook(account->id(), abURL);

        shared_ptr<ContactBook> book = existingBooks[id];
        if (!book) {
            book = make_shared<ContactBook>(id, account->id());
        }

        book->setSource(CARDDAV_SYNC_SOURCE);
        book->setURL(abURL);
        book->setName(displayName);
        book->setCtag(ctag);
        store->save(book.get());

        result.push_back(book);
    }));

    return result;
}
```

### Phase 2: Add Name Field to ContactBook

**File: `mailsync/MailSync/Models/ContactBook.hpp`**

```cpp
string name();
void setName(string name);
```

**File: `mailsync/MailSync/Models/ContactBook.cpp`**

```cpp
string ContactBook::name() {
    return _data.count("name") ? _data["name"].get<string>() : "Contacts";
}

void ContactBook::setName(string name) {
    _data["name"] = name;
}
```

### Phase 3: Update runContacts to Handle Multiple

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::runContacts() {
    if (account->provider() == "gmail") {
        return;
    }

    auto addressBooks = resolveAddressBooks();

    if (addressBooks.empty()) {
        logger->info("No address books found");
        return;
    }

    // Track which books we found (for cleanup)
    set<string> foundBookIds;

    for (auto & ab : addressBooks) {
        foundBookIds.insert(ab->id());

        // Check ctag before syncing
        string currentCtag = fetchAddressBookCtag(ab->url());
        if (ab->ctag() == currentCtag && currentCtag != "") {
            logger->info("Address book '{}' unchanged, skipping", ab->name());
            continue;
        }

        logger->info("Syncing address book '{}'", ab->name());
        runForAddressBook(ab);

        ab->setCtag(currentCtag);
        store->save(ab.get());
    }

    // Clean up address books that no longer exist
    cleanupRemovedAddressBooks(foundBookIds);
}
```

### Phase 4: Add Cleanup for Removed Address Books

**File: `mailsync/MailSync/DAVWorker.cpp`**

```cpp
void DAVWorker::cleanupRemovedAddressBooks(set<string> & foundBookIds) {
    auto allBooks = store->findAll<ContactBook>(
        Query().equal("accountId", account->id()).equal("source", CARDDAV_SYNC_SOURCE));

    for (auto & book : allBooks) {
        if (foundBookIds.count(book->id()) == 0) {
            logger->info("Address book '{}' removed from server, deleting", book->name());

            // Delete all contacts in this book
            auto contacts = store->findAll<Contact>(Query().equal("bookId", book->id()));
            for (auto & contact : contacts) {
                store->remove(contact.get());
            }

            // Delete associated groups
            auto groups = store->findAll<ContactGroup>(Query().equal("bookId", book->id()));
            for (auto & group : groups) {
                store->remove(group.get());
            }

            // Delete the book itself
            store->remove(book.get());
        }
    }
}
```

### Phase 5: Add ID Generation for ContactBooks

**File: `mailsync/MailSync/MailUtils.hpp`**

```cpp
string idForContactBook(string accountId, string url);
```

**File: `mailsync/MailSync/MailUtils.cpp`**

```cpp
string MailUtils::idForContactBook(string accountId, string url) {
    return hashString(accountId + url);
}
```

### Phase 6: Update TypeScript ContactBook Model

**File: `app/src/flux/models/contact-book.ts`** (if exists)

Add `name` attribute:
```typescript
name: Attributes.String({ modelKey: 'name' }),
```

## Migration Consideration

Existing users have one ContactBook with id `{accountId}-default`. After this change:
- Old contacts reference `bookId = "{accountId}-default"`
- New books will have different IDs

Options:
1. Keep the `-default` ID for the first/primary book
2. Migrate contacts to new bookId
3. Delete all and re-sync

Recommendation: Use option 1 - detect if this is the first address book and use the legacy ID format:

```cpp
string id;
if (result.empty() && existingBooks.count(account->id() + "-default")) {
    // First book, use legacy ID for compatibility
    id = account->id() + "-default";
} else {
    id = MailUtils::idForContactBook(account->id(), abURL);
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `mailsync/MailSync/Models/ContactBook.hpp/cpp` | Add name field |
| `mailsync/MailSync/MailUtils.hpp/cpp` | Add idForContactBook |
| `mailsync/MailSync/DAVWorker.hpp` | Update return types |
| `mailsync/MailSync/DAVWorker.cpp` | Handle multiple address books |

## Testing

1. Account with 1 address book - verify works as before
2. Account with 3 address books - verify all 3 synced
3. Remove address book from server - verify deleted locally
4. Contacts from different books - verify correct bookId
5. Contact groups in different books - verify correct association
