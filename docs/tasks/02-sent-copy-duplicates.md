# 02: Duplicate Sent copies

Read `README.md` first for how to test.

## Symptom

A live test on Office 365 (September 2026) found **67 messages in Sent Items with 2 to 4 copies each**, sitting at adjacent UIDs. Exchange had saved the sent message server-side, and Mailspring had APPENDed its own copy as well. The placements model now shows these faithfully, as two or more placements of one message.

Check the 3- and 4-copy groups against the logs before assuming a single cause. One APPEND can't produce them, so task retries may also be involved.

## How the engine sends today

`TaskProcessor::performRemoteSendDraft`:

1. Sends over SMTP.
2. Looks in Sent for a server-saved copy with `findUIDsOfRecentHeaderMessageID`. That helper only checks the **15 most recent messages by sequence number** (`MCIMAPSession.cpp` ~2132). It tries 4 times, sleeping 0, 1, 1 and 2 seconds, so it gives up after about 4 seconds.
3. If it finds nothing, it APPENDs. It needs a UID for the sent message so it can ingest it and attach metadata, and that need is what forces the APPEND.

## Research findings (September 2026)

| Provider | Server saves the SMTP copy? | Source |
|---|---|---|
| Gmail | Yes (already handled) | Google help 78892 |
| O365 / Exchange Online | Yes. The delay isn't documented, and throttling can push it later | MS Learn "send email using M365" comparison table ("Saves to Sent Items: Yes") |
| Outlook.com | Yes (unverified) | User reports; MailMate #2105 |
| Yahoo / AOL | Yes (consistent reports) | Thunderbird support 1272065; MS support article naming Yahoo and AOL |
| Zoho | Yes by default; can be turned off | Zoho community (vendor staff) |
| ProtonMail Bridge | Yes. It also deduplicates an APPEND that matches a recent send | `proton-bridge` `connector.go` (`sendRecorder`, 30 min expiry) |
| Fastmail | Only if the user opts in (off by default) | Fastmail blog; dejalu#62 |
| iCloud, GMX / Web.de, Dovecot+Postfix | No | Various; GMX's own guide tells users to set "place a copy in Sent" |

- **No protocol signal exists.** Neither SMTP (no EHLO keyword) nor IMAP (no capability) says whether the server saves the copy. `SENTCOPY` was an expired 2014 draft.
- **Other clients don't detect it either.** Thunderbird, K-9, Evolution and Outlook all use a manual per-account "save a copy" toggle, on by default.
- **Outlook.com's SMTP can rewrite the Message-ID** and move the original to `X-Microsoft-Original-Message-ID`. Sources: MS Q&A 1337178, Delta Chat #2250/#2265. When that happens, a Message-ID search can't find the server's copy. The APPENDed copy then hashes to a *different* message id, which gives a duplicate *message*, not a second placement. Our O365 duplicates share one id, so rewriting may depend on the tenant. Verify this live.

## Suggested approach

1. **Add a provider table `serverSavesSent`,** keyed on SMTP host and IMAP host. Set it to `true` for Gmail (as now), `smtp.office365.com` / `outlook.office365.com`, `smtp-mail.outlook.com`, Yahoo/AOL and Proton Bridge. Leave it `false` for everyone else. Zoho and Fastmail depend on user settings; step 3 covers them.
2. **Never APPEND when the table says the server saves.**
   - Poll Sent with a longer, backing-off window.
   - Search for both `Message-ID` and `X-Microsoft-Original-Message-ID`.
   - If the copy still hasn't appeared, insert the message locally with a UID-0 placement in Sent and attach metadata to its id. This mirrors the existing Gmail "not yet visible in All Mail" fallback. The next Sent scan then relinks the placement.
   - This depends on Exchange keeping Date, Subject, recipients and Message-ID intact, so that `idForMessage` gives the same id. **Verify that on the live O365 account.**
3. **Learn per account for unknown hosts.** Record the APPENDUID of the copy we uploaded. If a later Sent scan finds a second copy of the same message that we didn't upload:
   - delete *our* copy (UID EXPUNGE of exactly that UID; never a UID we didn't upload);
   - set a per-account flag so later sends skip the APPEND.

   The same logic can clean up existing duplicates.
4. **Multisend:** repeat the "delete gateway copies" step on the next Sent scan as well, for late-arriving per-recipient copies. They contain tracking pixels.
5. **Log how long O365 takes to save the copy** after SMTP completes. There's no public figure.

Apply the realism rule. Steps 1 and 2 cover the REAL cases. Step 3 is worth it only if it stays small.

## Testing

- **Harness.** The fake server has an SMTP sink (`fakeimap/smtp.py`, `smtp: true` in a scenario). Add a personality option that delivers a server-side Sent copy after a delay. Then add scenarios for:
  - the copy arriving within the window;
  - the copy arriving after the window;
  - a provider that never saves.

  In each, assert exactly one Sent copy on the server and one message locally.
- **Live.** On O365, send several messages (including to yourself). Then compare the Sent Items copies on the server with raw `FETCH ENVELOPE` output against the local rows, and check no new duplicates appear. Repeat on Yahoo and Gmail.
