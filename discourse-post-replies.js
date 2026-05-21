#!/usr/bin/env node
/**
 * Post Mailspring discourse reply drafts to community.getmailspring.com
 *
 * Reads discourse-reply-drafts.md, parses all reply operations, and either
 * previews them (default) or posts them to the Discourse API.
 *
 * Required env vars:
 *   DISCOURSE_API_KEY       - Discourse API key
 *   DISCOURSE_API_USERNAME  - Discourse username to post as (e.g. bengotow)
 *
 * Usage:
 *   node discourse-post-replies.js                        # dry run
 *   node discourse-post-replies.js --post                 # post everything
 *   node discourse-post-replies.js --post --skip=14433,14440
 *   node discourse-post-replies.js --post --only=14433,14440
 *   node discourse-post-replies.js --list                 # list all topic IDs
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
const DRAFT_FILE = path.join(__dirname, 'discourse-reply-drafts.md');
const RATE_LIMIT_MS = 1500; // ms between API calls

const IS_POST = process.argv.includes('--post');
const IS_LIST = process.argv.includes('--list');
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
// Helpers
// ---------------------------------------------------------------------------

/** Extract numeric topic ID from a Discourse URL or path fragment like /t/123 or /t/slug/123 */
function extractTopicId(url) {
  const m = url.match(/\/t\/(?:[^/]+\/)?(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Strip `> ` prefixes from a blockquote block, returning plain markdown */
function stripBlockquote(lines) {
  return lines
    .map(l => (l === '>' ? '' : l.replace(/^> ?/, '')))
    .join('\n')
    .trim();
}

/** Collect consecutive blockquote lines starting at index i in lines[], return {text, end} */
function collectBlockquote(lines, start) {
  const block = [];
  let i = start;
  while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
    block.push(lines[i]);
    i++;
  }
  return block.length ? { text: stripBlockquote(block), end: i } : null;
}

/** Find the first blockquote in a lines array, return its text or null */
function firstBlockquote(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> ') || lines[i] === '>') {
      const result = collectBlockquote(lines, i);
      if (result) return result.text;
    }
  }
  return null;
}

/** Find all blockquotes in lines[], return array of {label, text} where label is the preceding **bold:** line */
function namedBlockquotes(lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> ') || lines[i] === '>') {
      // Look back for a label line
      let label = '';
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].trim() === '') continue;
        if (lines[j].startsWith('**') && lines[j].endsWith(':**')) {
          label = lines[j].replace(/^\*\*/, '').replace(/:\*\*$/, '');
        }
        break;
      }
      const result = collectBlockquote(lines, i);
      if (result) {
        results.push({ label, text: result.text });
        i = result.end - 1;
      }
    }
  }
  return results;
}

/** Find all Discourse topic URLs/paths in a lines array */
function findTopicUrls(lines) {
  const urls = [];
  const re = /https?:\/\/community\.getmailspring\.com\/t\/[^\s),]+|\/t\/[\d]+/g;
  for (const line of lines) {
    let m;
    while ((m = re.exec(line)) !== null) {
      urls.push(m[0]);
    }
  }
  return [...new Set(urls)];
}

function shouldAddResolvedTag(actionLine, sectionTitle = '') {
  if (/resolved|close|fixed|confirmed/i.test(actionLine)) return true;
  // Cluster sections without an explicit Action line but whose title says "Fixed in"
  if (/fixed in v/i.test(sectionTitle)) return true;
  return false;
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

async function getTopicTags(topicId) {
  try {
    const data = await apiRequest('GET', `/t/${topicId}.json`);
    return data.tags || [];
  } catch (e) {
    console.warn(`  Warning: could not fetch tags for topic ${topicId}: ${e.message}`);
    return [];
  }
}

async function postReply(topicId, raw) {
  return apiRequest('POST', '/posts.json', { topic_id: topicId, raw });
}

async function addResolvedTag(topicId) {
  const existing = await getTopicTags(topicId);
  if (existing.includes('resolved')) {
    console.log(`  Tag: already has "resolved", skipping`);
    return;
  }
  const newTags = [...existing, 'resolved'];
  return apiRequest('PUT', `/t/${topicId}.json`, { tags: newTags });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Parse discourse-reply-drafts.md
// ---------------------------------------------------------------------------

/**
 * Returns array of operations:
 * { topicId, raw, resolveTag, section }
 */
function parseOperations(content) {
  const ops = [];

  // Split into major parts by h2 headings
  const parts = content.split(/^## /m).filter(Boolean);

  for (const part of parts) {
    const partLines = part.split('\n');
    const partTitle = partLines[0].trim();

    if (partTitle.startsWith('PART 3')) {
      parsePart3(partLines.slice(1), ops);
    } else {
      // Split sections within this part by --- dividers
      const sections = part.split(/^---$/m).filter(s => s.trim());
      for (const section of sections) {
        parseSection(section.trim(), ops);
      }
    }
  }

  return ops;
}

function parseSection(section, ops) {
  if (!section || section.startsWith('#')) {
    // Skip pure h2 intro paragraphs
    if (!section.includes('**Thread') && !section.includes('community.getmailspring.com')) return;
  }

  const lines = section.split('\n');
  const titleLine = lines.find(l => l.startsWith('### ')) || '';
  const sectionTitle = titleLine.replace(/^### \d+\.\s*/, '').trim();

  const actionLine = (lines.find(l => l.startsWith('**Action:**')) || '').replace('**Action:**', '').trim();
  const resolveTag = shouldAddResolvedTag(actionLine, sectionTitle);

  // ---- Detect special multi-reply sections ----

  // Section 3: "Primary thread" + "Duplicate threads" pattern
  if (lines.some(l => l.includes('**Primary thread (reply here first'))) {
    parseKeyboardRegressionSection(lines, sectionTitle, ops);
    return;
  }

  // Section 17: "**Primary thread:**" with named reply blocks
  if (lines.some(l => l.match(/^\*\*Primary thread:\*\*/))) {
    parseNamedReplySection(lines, sectionTitle, ops);
    return;
  }

  // ---- Standard: **Thread:** or **Threads:** (comma-separated) ----
  const threadLine = lines.find(l => l.startsWith('**Thread:**') || l.startsWith('**Threads:**'));
  if (threadLine) {
    const urls = findTopicUrls([threadLine]);
    const replyText = firstBlockquote(lines);
    if (!replyText) return; // no reply body, skip

    for (const url of urls) {
      const topicId = extractTopicId(url);
      if (topicId) {
        ops.push({ topicId, raw: replyText, resolveTag, section: sectionTitle });
      }
    }
    return;
  }

  // ---- Cluster: bullet-list URLs with single blockquote ----
  const bulletUrls = lines
    .filter(l => l.match(/^- https?:\/\/community\.getmailspring\.com\/t\//))
    .flatMap(l => findTopicUrls([l]));

  if (bulletUrls.length > 0) {
    const replyText = firstBlockquote(lines);
    if (!replyText) return;

    for (const url of bulletUrls) {
      const topicId = extractTopicId(url);
      if (topicId) {
        ops.push({ topicId, raw: replyText, resolveTag, section: sectionTitle });
      }
    }
  }
}

/** Section 3: keyboard regression with primary + duplicate sub-sections */
function parseKeyboardRegressionSection(lines, sectionTitle, ops) {
  const resolveTag = shouldAddResolvedTag('', sectionTitle);
  let primaryUrl = null;
  const duplicateUrls = [];
  let inDuplicateBlock = false;
  let primaryReply = null;
  let duplicateReply = null;

  // Find URLs and named blockquotes
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('**Primary thread (reply here first')) inDuplicateBlock = false;
    if (l.includes('**Duplicate threads')) inDuplicateBlock = true;

    if (l.startsWith('- https://')) {
      const id = extractTopicId(l);
      if (id) {
        if (!inDuplicateBlock && !primaryUrl) primaryUrl = id;
        else duplicateUrls.push(id);
      }
    }

    if (l.startsWith('**Reply for primary thread')) {
      const result = collectBlockquote(lines, i + 2);
      if (result) primaryReply = result.text;
    }
    if (l.startsWith('**Reply for duplicate threads')) {
      const result = collectBlockquote(lines, i + 2);
      if (result) duplicateReply = result.text;
    }
  }

  if (primaryUrl && primaryReply) {
    ops.push({ topicId: primaryUrl, raw: primaryReply, resolveTag: true, section: `${sectionTitle} (primary)` });
  }
  if (duplicateReply) {
    for (const id of duplicateUrls) {
      ops.push({ topicId: id, raw: duplicateReply, resolveTag: true, section: `${sectionTitle} (duplicate)` });
    }
  }
}

/** Section 17: named reply blocks with **Reply for #XXXXX:** labels */
function parseNamedReplySection(lines, sectionTitle, ops) {
  // Build map of topicId → URL from the header lines
  const urlsByLabel = {}; // label fragment → [topicId, ...]

  for (const line of lines) {
    if (line.startsWith('**Primary thread:**') || line.startsWith('**Related:**') || line.startsWith('**Older:**')) {
      findTopicUrls([line]).forEach(url => {
        const id = extractTopicId(url);
        if (id) {
          // Primary gets its own entry
          const key = line.startsWith('**Primary') ? 'primary' : 'related';
          (urlsByLabel[key] = urlsByLabel[key] || []).push(id);
        }
      });
    }
    // Also parse the "older" comma-delimited /t/ID paths
    if (line.startsWith('**Older:**')) {
      const ids = [...line.matchAll(/\/t\/(\d+)/g)].map(m => parseInt(m[1], 10));
      urlsByLabel['older'] = ids;
    }
  }

  // Collect named blockquotes — label contains the topic ID or "older"
  const namedBlocks = namedBlockquotes(lines);

  for (const { label, text } of namedBlocks) {
    if (!text) continue;
    // Match label to topic IDs
    const idMatch = label.match(/#(\d+)/g);
    if (idMatch) {
      for (const fragment of idMatch) {
        const id = parseInt(fragment.replace('#', ''), 10);
        const isClose = /duplicate|close|pointer|older/i.test(label);
        ops.push({ topicId: id, raw: text, resolveTag: isClose, section: `${sectionTitle} (${label})` });
      }
    } else if (/older/i.test(label)) {
      const olderIds = urlsByLabel['older'] || [];
      for (const id of olderIds) {
        ops.push({ topicId: id, raw: text, resolveTag: true, section: `${sectionTitle} (older)` });
      }
    }
  }
}

/** Part 3: duplicate table — generate standard "duplicate of canonical" replies */
function parsePart3(lines, ops) {
  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('| Duplicate')) continue; // skip header/divider
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;

    const [dupCell, canonicalCell, statusCell] = cells;

    // Extract canonical topic ID and construct its full URL
    const canonicalIds = [...canonicalCell.matchAll(/\/t\/(\d+)/g)].map(m => parseInt(m[1], 10));
    const canonicalId = canonicalIds[0];
    if (!canonicalId) continue;

    const canonicalUrl = `https://community.getmailspring.com/t/${canonicalId}`;

    // Extract duplicate topic IDs
    const dupIds = [...dupCell.matchAll(/\/t\/(\d+)/g)].map(m => parseInt(m[1], 10));

    // Skip IDs already handled by a named section (avoid double-posting)
    // We keep Part 3 entries as the authoritative source only for IDs not in Part 1/2
    for (const id of dupIds) {
      const raw = `This is a duplicate of ${canonicalUrl} — please see that thread for the answer/resolution.`;
      ops.push({ topicId: id, raw, resolveTag: true, section: `Part 3 duplicate → /t/${canonicalId}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Dedup: if a topicId appears in both Part 1/2 sections AND Part 3,
// prefer the richer Part 1/2 reply and drop the Part 3 generic one.
// ---------------------------------------------------------------------------
function deduplicateOps(ops) {
  const seen = new Map(); // topicId → index in result array

  const result = [];
  for (const op of ops) {
    const existingIdx = seen.get(op.topicId);
    if (existingIdx === undefined) {
      seen.set(op.topicId, result.length);
      result.push({ ...op });
      continue;
    }
    const existing = result[existingIdx];
    // If the new one is a Part 3 generic reply: keep existing but OR the resolveTag
    if (op.section.startsWith('Part 3')) {
      existing.resolveTag = existing.resolveTag || op.resolveTag;
      continue;
    }
    // If existing is Part 3 and new is richer: replace, preserving OR of resolveTag
    if (existing.section.startsWith('Part 3')) {
      result[existingIdx] = { ...op, resolveTag: op.resolveTag || existing.resolveTag };
      continue;
    }
    // Both are non-Part-3: keep both (e.g. different named replies to same thread)
    seen.set(op.topicId, result.length); // point to the later one
    result.push({ ...op });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const content = fs.readFileSync(DRAFT_FILE, 'utf8');
  const allOps = parseOperations(content);
  const ops = deduplicateOps(allOps);

  // Apply --only / --skip filters
  const filtered = ops.filter(op => {
    if (ONLY_IDS.size > 0 && !ONLY_IDS.has(op.topicId)) return false;
    if (SKIP_IDS.has(op.topicId)) return false;
    return true;
  });

  if (IS_LIST) {
    console.log('Topic IDs to post to:');
    console.log([...new Set(filtered.map(o => o.topicId))].sort((a, b) => a - b).join(', '));
    return;
  }

  console.log(`\nMailspring Discourse Reply Poster`);
  console.log(`Mode: ${IS_POST ? 'LIVE POST' : 'DRY RUN'}`);
  console.log(`Operations: ${filtered.length} (${allOps.length} total, ${allOps.length - filtered.length} filtered)`);
  console.log(`Username: ${API_USERNAME || '(not set)'}\n`);

  let posted = 0, tagged = 0, errors = 0;

  for (const op of filtered) {
    const prefix = `[${op.topicId}]`;
    console.log(`${prefix} ${op.section}`);
    console.log(`  URL: ${DISCOURSE_BASE}/t/${op.topicId}`);
    console.log(`  Tag resolved: ${op.resolveTag}`);
    console.log(`  Reply (${op.raw.length} chars):`);
    // Show first 200 chars of reply
    const preview = op.raw.slice(0, 200).replace(/\n/g, ' ');
    console.log(`    "${preview}${op.raw.length > 200 ? '…' : ''}"`);
    console.log();

    if (IS_POST) {
      try {
        await postReply(op.topicId, op.raw);
        console.log(`  ✓ Reply posted`);
        posted++;
        await sleep(RATE_LIMIT_MS);

        if (op.resolveTag) {
          await addResolvedTag(op.topicId);
          console.log(`  ✓ "resolved" tag added`);
          tagged++;
          await sleep(RATE_LIMIT_MS);
        }
      } catch (e) {
        console.error(`  ✗ Error: ${e.message}`);
        errors++;
      }
      console.log();
    }
  }

  if (IS_POST) {
    console.log(`\nDone. Posted: ${posted}, Tagged: ${tagged}, Errors: ${errors}`);
  } else {
    console.log(`\nDry run complete. Run with --post to execute.`);
    console.log(`Use --only=ID1,ID2 or --skip=ID1,ID2 to filter.`);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
