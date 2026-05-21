#!/usr/bin/env node
/**
 * Post Mailspring discourse reply drafts to community.getmailspring.com
 *
 * Reads a markdown file of reply drafts in the standard format and either
 * previews them (default) or posts them to the Discourse API.
 *
 * Format expected in the markdown file:
 *
 *   ### Any Title
 *   **Thread:** https://community.getmailspring.com/t/slug/ID
 *   **Action:** Reply + mark Resolved   ← optional; "Resolved" triggers the resolved tag
 *
 *   > Reply text here (markdown).
 *   > Continues on next line.
 *
 * Required env vars (for --post):
 *   DISCOURSE_API_KEY       - Discourse API key
 *   DISCOURSE_API_USERNAME  - Discourse username to post as (e.g. bengotow)
 *
 * Usage:
 *   node discourse-post-replies.js                              # dry run, default file
 *   node discourse-post-replies.js --file=discourse-replies-batch-1.md
 *   node discourse-post-replies.js --post                       # post everything
 *   node discourse-post-replies.js --post --skip=14433,14440
 *   node discourse-post-replies.js --post --only=14433,14440
 *   node discourse-post-replies.js --list                       # list topic IDs only
 */

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DISCOURSE_BASE = 'https://community.getmailspring.com';
const API_KEY = process.env.DISCOURSE_API_KEY;
const API_USERNAME = process.env.DISCOURSE_API_USERNAME;
const RATE_LIMIT_MS = 1500;

const IS_POST = process.argv.includes('--post');
const IS_LIST = process.argv.includes('--list');
const FILE_ARG = (process.argv.find(a => a.startsWith('--file=')) || '').replace('--file=', '');
const DRAFT_FILE = path.resolve(FILE_ARG || path.join(__dirname, 'discourse-reply-drafts.md'));
const SKIP_IDS = new Set(
  (process.argv.find(a => a.startsWith('--skip=')) || '').replace('--skip=', '')
    .split(',').filter(Boolean).map(Number)
);
const ONLY_IDS = new Set(
  (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '')
    .split(',').filter(Boolean).map(Number)
);

if (IS_POST && (!API_KEY || !API_USERNAME)) {
  console.error('Error: DISCOURSE_API_KEY and DISCOURSE_API_USERNAME must be set to post.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parser — simple single-format
// ---------------------------------------------------------------------------

/**
 * Parse the markdown file into an array of operations:
 * { topicId, raw, resolveTag, title }
 *
 * Each entry corresponds to one ### section with a **Thread:** line and a blockquote.
 */
function parseOperations(content) {
  const ops = [];

  // Split on ### headings (keep the heading in each chunk)
  const sections = content.split(/(?=^### )/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');

    const titleLine = lines.find(l => l.startsWith('### ')) || '';
    const title = titleLine.replace(/^### \d+\.\s*/, '').trim();

    const threadLine = lines.find(l => l.startsWith('**Thread:**'));
    if (!threadLine) continue;

    // Extract topic ID from URL
    const urlMatch = threadLine.match(/https?:\/\/community\.getmailspring\.com\/t\/[^\s)]+/);
    if (!urlMatch) continue;
    const idMatch = urlMatch[0].match(/\/t\/(?:[^/]+\/)?(\d+)/);
    if (!idMatch) continue;
    const topicId = parseInt(idMatch[1], 10);

    const actionLine = (lines.find(l => l.startsWith('**Action:**')) || '').replace('**Action:**', '').trim();
    const resolveTag = /resolved|close/i.test(actionLine);

    // Collect the blockquote
    const blockLines = [];
    for (const l of lines) {
      if (l.startsWith('> ') || l === '>') blockLines.push(l);
    }
    if (blockLines.length === 0) continue;

    const raw = blockLines
      .map(l => (l === '>' ? '' : l.replace(/^> ?/, '')))
      .join('\n')
      .trim();

    ops.push({ topicId, raw, resolveTag, title });
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Discourse API
// ---------------------------------------------------------------------------

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'community.getmailspring.com',
      path: urlPath,
      method,
      headers: {
        'Api-Key': API_KEY,
        'Api-Username': API_USERNAME,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function postReply(topicId, raw) {
  return apiRequest('POST', '/posts.json', { topic_id: topicId, raw });
}

async function addResolvedTag(topicId) {
  let existing = [];
  try {
    const data = await apiRequest('GET', `/t/${topicId}.json`);
    existing = data.tags || [];
  } catch (e) {
    console.warn(`  Warning: could not fetch tags for ${topicId}: ${e.message}`);
  }
  if (existing.includes('resolved')) {
    console.log(`  Tag: already has "resolved", skipping`);
    return;
  }
  return apiRequest('PUT', `/t/${topicId}.json`, { tags: [...existing, 'resolved'] });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(DRAFT_FILE)) {
    console.error(`File not found: ${DRAFT_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(DRAFT_FILE, 'utf8');
  const allOps = parseOperations(content);

  const ops = allOps.filter(op => {
    if (ONLY_IDS.size > 0 && !ONLY_IDS.has(op.topicId)) return false;
    if (SKIP_IDS.has(op.topicId)) return false;
    return true;
  });

  if (IS_LIST) {
    console.log([...new Set(ops.map(o => o.topicId))].sort((a, b) => a - b).join(', '));
    return;
  }

  console.log(`\nMailspring Discourse Reply Poster`);
  console.log(`File:       ${DRAFT_FILE}`);
  console.log(`Mode:       ${IS_POST ? 'LIVE POST' : 'DRY RUN'}`);
  console.log(`Operations: ${ops.length} (${allOps.length} total, ${allOps.length - ops.length} filtered)`);
  console.log(`Username:   ${API_USERNAME || '(not set)'}\n`);

  let posted = 0, tagged = 0, errors = 0;

  for (const op of ops) {
    console.log(`[${op.topicId}] ${op.title}`);
    console.log(`  ${DISCOURSE_BASE}/t/${op.topicId}`);
    console.log(`  resolved tag: ${op.resolveTag}`);
    const preview = op.raw.slice(0, 160).replace(/\n/g, ' ');
    const suffix = op.raw.length > 160 ? '…"' : '"';
    console.log(`  "${preview}${suffix}`);
    console.log();

    if (IS_POST) {
      try {
        await postReply(op.topicId, op.raw);
        console.log(`  ✓ reply posted`);
        posted++;
        await sleep(RATE_LIMIT_MS);

        if (op.resolveTag) {
          await addResolvedTag(op.topicId);
          console.log(`  ✓ "resolved" tag added`);
          tagged++;
          await sleep(RATE_LIMIT_MS);
        }
      } catch (e) {
        console.error(`  ✗ ${e.message}`);
        errors++;
      }
      console.log();
    }
  }

  if (IS_POST) {
    console.log(`\nDone. Posted: ${posted}, Tagged: ${tagged}, Errors: ${errors}`);
  } else {
    console.log(`Dry run complete. Run with --post to execute.`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
