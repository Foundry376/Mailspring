# Mailspring Weekly Community Engagement Routine

This document describes the weekly process for reviewing the Mailspring Discourse community, drafting replies, and posting them. Run this approximately once per week, or after each release.

---

## Overview

The workflow has four phases:

1. **Setup** — Rebase the working branch, read the changelog and skip list
2. **Research & Draft** — Fetch recent forum topics, research the codebase, write replies to a dated draft file
3. **Review** — Present the draft file and wait for explicit approval before posting
4. **Post** — Run the CLI script only after approval is confirmed

All previously-posted topic IDs are tracked in `discourse-posted-ids.json` so we automatically skip topics we've already replied to.

---

## Phase 1: Setup

### 1a. Rebase the working branch

Always start by making sure the working branch is up to date with master so we have the latest changelog and posted-IDs history:

```bash
git fetch origin
git checkout claude/mailspring-discourse-replies-qgDGG
git rebase origin/master
```

If the rebase has conflicts, resolve them, then `git rebase --continue`.

### 1b. Read context

1. **The changelog** — note all bug fixes and features in the most recent 1–2 releases:
   ```
   /home/user/Mailspring/CHANGELOG.md
   ```

2. **The posted-IDs skip list** — never write a reply for a topic ID already in this file:
   ```
   /home/user/Mailspring/discourse-posted-ids.json
   ```

### 1c. Survey recent forum activity

Fetch each category's page 0 and `latest.json` to get a sense of volume before diving in:

| Category | URL |
|---|---|
| Latest (all) | `https://community.getmailspring.com/latest.json` |
| Help | `https://community.getmailspring.com/c/help/7.json?page=0` |
| Bugs | `https://community.getmailspring.com/c/bugs/10.json?page=0` |
| Service Issues | `https://community.getmailspring.com/c/service-issues/11.json?page=0` |

---

## Phase 2: Research & Draft

Work through each category sequentially. For a typical week, page 0 of each category (≈ 30 topics each) is sufficient. After a release, also scan the Bugs category for threads matching the fixes in the changelog.

### Step 2a: Filter topics

For each topic on the page:

**SKIP if any of these are true:**
- The topic ID is in `discourse-posted-ids.json`
- The topic already has the tag `resolved`
- It is a pinned documentation post (IDs: 18, 162, 199, 200, 296)
- It is an appreciation or announcement post with no question
- It already has a complete, accurate answer from a knowledgeable community member

**PRIORITIZE:**
- Topics with 0 replies, or replies that don't actually solve the problem
- Topics where the user's bug has been fixed in a recent release
- Topics with clear, answerable questions

### Step 2b: Fetch full topic details

For each topic you plan to reply to, fetch `https://community.getmailspring.com/t/{id}.json` and read the full post and all replies before writing anything.

### Step 2c: Research using the codebase

The Mailspring source lives in **two locations** — always search both:
- `/home/user/Mailspring/app/src/`
- `/home/user/Mailspring/app/internal_packages/`

Key files to know:
- `app/src/config-schema.ts` — all user-facing settings and their defaults
- `app/internal_packages/` — each feature is a subdirectory (composer-signature, snooze, translation, open-tracking, link-tracking, themes, print, etc.)
- `app/src/flux/stores/` — data stores (AccountStore, DraftStore, MessageStore, etc.)
- `app/src/flux/tasks/` — async operations (ChangeFolderTask, SendDraftTask, etc.)
- `CHANGELOG.md` — release history

Use `grep -r` to find relevant code. Read actual source before making claims about how a feature works.

### Step 2d: Write the draft file

Write all replies to a single dated file:

```
/home/user/Mailspring/discourse-replies-YYYY-MM-DD.md
```

Use the format described in [Phase 3](#phase-3-draft-file-format) below.

---

## Phase 3: Draft File Format

The draft file must use this exact format (the posting script depends on it):

```markdown
# Mailspring Discourse Reply Drafts — YYYY-MM-DD

### 1. Topic title
**Thread:** https://community.getmailspring.com/t/slug/ID
**Action:** Reply

> Reply text in markdown.
> Second line of reply.

### 2. Another topic
**Thread:** https://community.getmailspring.com/t/slug/ID
**Action:** Reply + mark Resolved

> Complete answer — topic can be closed.
```

**Action values:**
- `Reply` — post the reply, leave topic open
- `Reply + mark Resolved` — post the reply and add the `resolved` tag

---

## Phase 4: Review (REQUIRED before posting)

After writing the draft file, **present it to Ben for review before doing anything else.** Use `SendUserFile` to surface the file, or clearly state the filename and ask for explicit approval.

Do not run the posting script until you receive a clear "go ahead" or "looks good" from Ben.

Ben will:
- Check factual accuracy — does the reply match how the feature actually works?
- Adjust tone where needed — does it sound right?
- Remove entries where the answer isn't confident enough to post
- Edit the blockquote text directly in the markdown file

The script posts exactly what's in the blockquote, so what Ben sees in the file is what gets posted.

To preview what will be posted without sending anything (useful for a sanity check):
```bash
node discourse-post-replies.js --file=discourse-replies-YYYY-MM-DD.md
```

---

## Phase 5: Post (only after explicit approval)

After Ben approves the draft file:

```bash
DISCOURSE_API_KEY=your_key DISCOURSE_API_USERNAME=bengotow \
  node discourse-post-replies.js --file=discourse-replies-YYYY-MM-DD.md --post
```

**Flags:**
- `--post` — actually post (without this, it's a dry run)
- `--only=14433,14440` — post only specific topic IDs
- `--skip=14433,14440` — skip specific topic IDs
- `--list` — print the topic IDs that would be posted (useful for auditing)

After posting, `discourse-posted-ids.json` is automatically updated with all newly posted topic IDs.

---

## Post-Session Checklist

After each weekly run:

```bash
# 1. Commit the draft file and updated posted-IDs
git add discourse-replies-*.md discourse-posted-ids.json
git commit -m "Weekly discourse replies — $(date +%Y-%m-%d)"

# 2. Push
git push -u origin claude/mailspring-discourse-replies-qgDGG
```

---

## Reply Guidelines

### Tone and voice
- Write as Ben — warm, personal, technically direct
- Use "we" for the product/team, "I" when speaking personally ("I'll note this as a feature request")
- Be honest: if something isn't supported, say so clearly
- Keep replies concise: 2–5 sentences for simple answers, numbered steps for procedures
- Never make up behavior you haven't confirmed in the codebase or changelog

### When a bug has been fixed in a recent release

> Good news — this was fixed in **vX.Y.Z** (released [date])! [One sentence describing what was fixed.] Please update to the latest version and let us know if you're still seeing the issue.

Use `**Action: Reply + mark Resolved**` so the `resolved` tag is applied.

If the fix is in the *current* release (just shipped), mention it by version and encourage the update. If it was fixed several releases back and the user hasn't updated, gently point this out.

### When a bug is known but not yet fixed

> Thanks for the report. This is a known issue — [brief description of root cause if known]. We don't have a fix in the current release, but [workaround if one exists]. I've noted your report and will update this thread when it's addressed.

Use `**Action: Reply**` (leave the thread open). Do not promise a timeline.

If there's a workaround, always lead with it.

### When the issue is a configuration question or how-to

Answer directly with exact menu paths (e.g., **Preferences > Accounts > Folder Settings**). If relevant, mention a related preference key from `config-schema.ts`. Mark `**Action: Reply + mark Resolved**` if the answer is complete and definitive.

### When you cannot answer accurately

Do not write a reply. It is better to leave a thread unanswered than to give wrong information. Skip it.

### Duplicate topics

If a topic is clearly a duplicate of another, reply:

> This looks like a duplicate of [URL] — please see that thread for the answer.

Use `**Action: Reply + mark Resolved**`.

---

## After a Release: Bug-Fix Notification Pass

When a new version ships, run a targeted pass to notify users whose bugs were addressed:

1. Read `CHANGELOG.md` and list every bug fix in the new release
2. Search the forum for threads describing those bugs — use the Discourse search API:
   ```
   https://community.getmailspring.com/search.json?q=keyword+category:bugs
   ```
3. For each matching thread not in `discourse-posted-ids.json`, draft a "fixed in vX.Y.Z" reply
4. Use `**Action: Reply + mark Resolved**` for all of them
5. Present the draft file for review before posting, as always

---

## Suggested Weekly Schedule

| Day | Action |
|---|---|
| Monday | Run the weekly routine; post only after reviewing and approving the draft |
| Release day | Run the bug-fix notification pass immediately after the release announcement |

---

## File Reference

| File | Purpose |
|---|---|
| `discourse-post-replies.js` | CLI posting script |
| `discourse-posted-ids.json` | Tracks all topic IDs we've replied to — **commit this after every run** |
| `discourse-replies-YYYY-MM-DD.md` | Weekly draft file — review and approve before posting |
| `CHANGELOG.md` | Release history — read this to identify fixed bugs |
| `discourse-weekly-routine.md` | This file |
