# Mailspring Weekly Community Engagement Routine

This document describes the weekly process for reviewing the Mailspring Discourse community, drafting replies, and posting them. Run this approximately once per week, or after each release.

---

## Overview

The workflow has three phases:

1. **Research** — Parallel sub-agents scan forum categories and the changelog, then search the codebase to understand each topic
2. **Draft** — Agents write `discourse-replies-batch-N.md` files in the standard format
3. **Review & Post** — You review and edit the drafts, then post with the CLI script

All previously-posted topic IDs are tracked in `discourse-posted-ids.json` so agents automatically skip topics we've already replied to.

---

## Prerequisites

```bash
# Required environment variables for posting
export DISCOURSE_API_KEY="your-api-key"
export DISCOURSE_API_USERNAME="bengotow"

# The posting script
node discourse-post-replies.js --help
```

---

## Phase 1: Determine What's New

Before spawning agents, establish context by checking:

1. **The changelog** — what was fixed or shipped since last week:
   ```
   /home/user/Mailspring/CHANGELOG.md
   ```

2. **The posted-IDs file** — topic IDs already replied to (never post twice):
   ```
   /home/user/Mailspring/discourse-posted-ids.json
   ```

3. **Recent forum activity** — how many new topics to cover:
   - Fetch `https://community.getmailspring.com/latest.json` for cross-category activity
   - Fetch page 0 of each category to gauge volume

---

## Phase 2: Spawn Parallel Sub-agents

Divide the work by assigning each agent 1–2 pages of a category (30 topics per page). For a typical week, 2–3 agents covering the most recent pages of all three categories is sufficient. After a release, run an additional pass specifically targeting bug reports.

### Categories to cover

| Category | URL | Focus |
|---|---|---|
| Help | `https://community.getmailspring.com/c/help/7.json?page=N` | How-to questions, config problems |
| Bugs | `https://community.getmailspring.com/c/bugs/10.json?page=N` | Bug reports — fixed or explain status |
| Service Issues | `https://community.getmailspring.com/c/service-issues/11.json?page=N` | Account, sync, connectivity issues |
| Latest (all) | `https://community.getmailspring.com/latest.json` | Cross-category sweep for missed threads |

### Standard sub-agent prompt template

Give each agent the following instructions, filling in `BATCH_NUMBER`, `PAGES`, `CATEGORY_URL`, and `OUTPUT_FILE`:

---

> You are helping Ben Gotow (founder of Mailspring) draft support replies for https://community.getmailspring.com
>
> **Your assigned pages:** [PAGES — e.g., "page=0 and page=1"]
> **Category URL:** [CATEGORY_URL]
> **Output file:** `/home/user/Mailspring/discourse-replies-batch-[N].md`
>
> ## Step 1: Read context
>
> - Read `/home/user/Mailspring/CHANGELOG.md` — note all bug fixes and features in the most recent 1–2 releases. You will need this to tell users whether their reported bug has been fixed.
> - Read `/home/user/Mailspring/discourse-posted-ids.json` — this is your skip list. Never write a reply for a topic ID in this file.
>
> ## Step 2: Fetch and filter topics
>
> Fetch the category pages. For each topic:
>
> **SKIP if any of these are true:**
> - The topic ID is in `discourse-posted-ids.json`
> - The topic already has the tag `resolved`
> - It is a pinned documentation post (IDs: 18, 162, 199, 200, 296)
> - It is an appreciation/announcement post with no question
> - It already has a complete, accurate answer from a knowledgeable community member
>
> **PRIORITIZE:**
> - Topics with 0 replies, or replies that don't actually solve the problem
> - Topics where the user's bug has been fixed in a recent release
> - Topics with clear, answerable questions
>
> ## Step 3: Fetch full topic details
>
> For each topic you plan to reply to, fetch `https://community.getmailspring.com/t/{id}.json` and read the full post and all replies.
>
> ## Step 4: Research using the codebase
>
> The Mailspring source lives in **two locations** — always search both:
> - `/home/user/Mailspring/app/src/`
> - `/home/user/Mailspring/app/internal_packages/`
>
> Key files to know:
> - `app/src/config-schema.ts` — all user-facing settings and their defaults
> - `app/internal_packages/` — each feature is a subdirectory (composer-signature, snooze, translation, open-tracking, link-tracking, themes, print, etc.)
> - `app/src/flux/stores/` — data stores (AccountStore, DraftStore, MessageStore, etc.)
> - `app/src/flux/tasks/` — async operations (ChangeFolderTask, SendDraftTask, etc.)
> - `CHANGELOG.md` — release history
>
> Use `grep -r` to find relevant code. Read actual source before making claims about how a feature works.
>
> ## Step 5: Write reply drafts
>
> Apply the reply guidelines below, then write to the output file.

---

### Reply guidelines (include these in every agent prompt)

#### Tone and voice
- Write as Ben — warm, personal, technically direct
- Use "we" for the product/team, "I" when speaking personally ("I'll note this as a feature request")
- Be honest: if something isn't supported, say so clearly
- Keep replies concise: 2–5 sentences for simple answers, numbered steps for procedures
- Never make up behavior you haven't confirmed in the codebase or changelog

#### When a bug has been fixed in a recent release

> Good news — this was fixed in **vX.Y.Z** (released [date])! [One sentence describing what was fixed.] Please update to the latest version and let us know if you're still seeing the issue.

Use `**Action: Reply + mark Resolved**` so the `resolved` tag is applied.

If the fix is in the *current* release (just shipped), mention it by version and encourage the update. If it was fixed several releases back and the user hasn't updated, gently point this out.

#### When a bug is known but not yet fixed

> Thanks for the report. This is a known issue — [brief description of root cause if known]. We don't have a fix in the current release, but [workaround if one exists]. I've noted your report and will update this thread when it's addressed.

Use `**Action: Reply**` (leave the thread open). Do not promise a timeline.

If there's a workaround, always lead with it.

#### When the issue is a configuration question or how-to

Answer directly with exact menu paths (e.g., **Preferences > Accounts > Folder Settings**). If relevant, mention a related preference key from `config-schema.ts`. Mark `**Action: Reply + mark Resolved**` if the answer is complete and definitive.

#### When you cannot answer accurately

Do not write a reply. It is better to leave a thread unanswered than to give wrong information. Skip it.

#### Duplicate topics

If a topic is clearly a duplicate of another, reply:

> This looks like a duplicate of [URL] — please see that thread for the answer.

Use `**Action: Reply + mark Resolved**`.

---

## Phase 3: Draft File Format

Each batch file must use this exact format (the posting script depends on it):

```markdown
# Mailspring Discourse Reply Drafts — Batch N

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

## Phase 4: Review and Edit

Open each batch file and review carefully:

- **Factual accuracy** — does the reply match how the feature actually works?
- **Tone** — does it sound like you?
- **Completeness** — is the answer actually helpful, or does it need more detail?
- **False positives** — remove any entry where you're not confident the reply adds value

Edit the markdown directly. The script posts exactly what's in the blockquote, so what you see is what gets posted.

To preview what will be posted without sending anything:
```bash
node discourse-post-replies.js --file=discourse-replies-batch-1.md
```

---

## Phase 5: Post

Post each batch file after reviewing it:

```bash
DISCOURSE_API_KEY=your_key DISCOURSE_API_USERNAME=bengotow \
  node discourse-post-replies.js --file=discourse-replies-batch-1.md --post
```

**Flags:**
- `--post` — actually post (without this, it's a dry run)
- `--only=14433,14440` — post only specific topic IDs
- `--skip=14433,14440` — skip specific topic IDs
- `--list` — print the topic IDs that would be posted (useful for auditing)

After posting, `discourse-posted-ids.json` is automatically updated. This file is committed to the repo so future runs won't re-post the same topics.

---

## Post-Session Checklist

After each weekly run:

```bash
# 1. Commit the batch files and updated posted-IDs
git add discourse-replies-batch-*.md discourse-posted-ids.json
git commit -m "Weekly discourse replies — $(date +%Y-%m-%d)"

# 2. Clean up batch files (optional, keep them for audit trail)
# rm discourse-replies-batch-*.md

# 3. Push
git push
```

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

The sub-agent prompt for this pass should include the full list of bug fixes from the changelog and instruct the agent to match each fix to forum threads.

---

## Suggested Weekly Schedule

| Day | Action |
|---|---|
| Monday | Run the weekly routine; post batches after review |
| Release day | Run the bug-fix notification pass immediately after the release announcement |

---

## File Reference

| File | Purpose |
|---|---|
| `discourse-post-replies.js` | CLI posting script |
| `discourse-posted-ids.json` | Tracks all topic IDs we've replied to — **commit this after every run** |
| `discourse-replies-batch-N.md` | Draft batch files — review before posting, commit for audit trail |
| `CHANGELOG.md` | Release history — agents read this to identify fixed bugs |
| `discourse-weekly-routine.md` | This file |
