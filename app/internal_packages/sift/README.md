# Sift

AI triage, thread briefs, drafting and "ask your inbox" for Mailspring, using any model on
[OpenRouter](https://openrouter.ai). The default is `deepseek/deepseek-v4.1-flash`.

Sift does nothing until you add an OpenRouter API key in **Preferences → Sift**. Until then it sends no
requests, and it adds no thread card or composer button. Only the ✦ nav-rail entry and the Preferences tab
appear, so the feature can be found.

## Features

- **Thread list:** a one-line AI summary replaces the snippet (`Thread:MailLabel`). Chips flag
  *Urgent* / *High*, *Reply* and *Suspicious* threads.
- **Sidebar:** *Priority* and *Needs reply* smart views (`ExtensionRegistry.AccountSidebar` plus a
  `MailboxPerspective` over triaged thread IDs).
- **Thread view:** a brief above the messages (`MessageListHeaders`). It shows where the thread stands,
  action items with due dates, phishing warnings, and one-click reply suggestions that stream into the
  inline reply.
- **Composer:** a *Sift* button (`Composer:ActionButton`) that writes a reply or email from an
  instruction or the user's notes, or rewrites the draft. Text goes above the signature and quoted reply.
- **Sift sheet** (`NavRail:Item`): *ask your inbox*. An agent with read-only tools (search, list, read
  thread, list to-dos) answers questions and links the threads it used. It also has a briefing and a list
  of every open to-do.
- **Preferences:** API key, model, triage window, "about you" and writing-style notes, excluded senders,
  and session token and cost totals.

## Privacy and safety

- The API key is stored with `KeyManager`, Mailspring's encrypted credential store.
- Mail is sent to OpenRouter only when Sift triages recent inbox threads (configurable) or when the user
  drafts against, opens or asks about a thread. Excluded senders and domains are never sent.
- Email content is wrapped and marked as untrusted. Instructions found inside mail are treated as a
  phishing signal, never followed.
- The agent cannot send, delete, move or modify anything. Suspicious threads get no reply suggestions.
- Model output is rendered as React elements, never as HTML. Only links to the user's own threads are
  clickable.

## Layout

```
lib/ai/openrouter.ts   fetch-based OpenRouter client (chat, SSE streaming, tool-call assembly, retries)
lib/ai/client.ts       model + reasoning effort, JSON-schema output, usage/cost, error messages
lib/ai/triage.ts       structured triage per thread (Zod schema)
lib/ai/draft.ts        streaming drafts and rewrites
lib/ai/ask.ts          agent loop over read-only mailbox tools; briefing
lib/mail/*             thread loading and plain-text extraction, mailbox queries, composer insertion
lib/stores/*           triage queue + cache (<config>/sift/insights.json), Ask conversation, generation state, usage
lib/ui/*               components registered in main.tsx
```

Specs live in `specs/sift-spec.tsx`. Run them with `npm test -- -f sift-spec`.
