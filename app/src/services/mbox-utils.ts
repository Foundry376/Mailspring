import fs from 'fs';
import path from 'path';

/**
 * Utilities for assembling an mbox file from a directory of raw RFC 2822
 * (.eml) files produced by GetManyRFC2822Task.
 *
 * Assembly is incremental: batches of staged messages are appended to the
 * mbox and their .eml files deleted as the export progresses, so the staging
 * directory never holds more than the not-yet-appended window of the export
 * (rather than a full second copy of the folder). A manifest file in the
 * staging directory records how far assembly has gotten; appends are ordered
 * append → fsync → manifest → delete so that a crash at any point is
 * recoverable without losing or duplicating messages (see
 * appendStagedMessages).
 *
 * The variant written is "mboxrd": message bodies are stored with LF line
 * endings, and any body line matching /^>*From / is quoted with an extra ">"
 * so the "From " separator lines remain unambiguous. This is the most widely
 * compatible dialect (Thunderbird, mutt, Google Takeout all read it).
 *
 * All file contents are treated as latin1 so message bytes pass through
 * unmodified regardless of charset or Content-Transfer-Encoding.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Build an mbox "From " separator line. The timestamp uses the traditional
 * asctime layout in UTC ("Thu Jan  1 00:00:00 2026") — the day of month is
 * space-padded, which some strict parsers require.
 */
export function mboxFromLine(sender: string, date: Date): string {
  const day = DAY_NAMES[date.getUTCDay()];
  const month = MONTH_NAMES[date.getUTCMonth()];
  const dom = String(date.getUTCDate()).padStart(2, ' ');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `From ${sender} ${day} ${month} ${dom} ${hh}:${mm}:${ss} ${date.getUTCFullYear()}\n`;
}

/**
 * Extract the envelope sender for the "From " line from a raw message's
 * headers, preferring Return-Path over From. Returns MAILER-DAEMON when no
 * address can be found, mirroring what MTAs write for bounces.
 */
export function senderFromEml(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  const headerEnd = normalized.indexOf('\n\n');
  const headers = (headerEnd === -1 ? normalized : normalized.substring(0, headerEnd))
    // unfold continuation lines
    .replace(/\n[ \t]+/g, ' ');

  // The result lands on the "From " separator line, whose format relies on
  // space-delimited fields — strip control characters so a crafted header
  // can't inject bytes that confuse mbox parsers. (Whitespace is already
  // excluded by the regexes below.)
  const sanitize = (addr: string) =>
    // eslint-disable-next-line no-control-regex
    addr.replace(/[\u0000-\u001f\u007f]/g, '');

  for (const name of ['return-path', 'from']) {
    const match = headers.match(new RegExp(`^${name}:(.*)$`, 'im'));
    if (!match) {
      continue;
    }
    const value = match[1];
    const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/);
    if (bracketed) {
      return sanitize(bracketed[1]);
    }
    const bare = value.match(/([^\s<>,;:"'()]+@[^\s<>,;:"'()]+)/);
    if (bare) {
      return sanitize(bare[1]);
    }
  }
  return 'MAILER-DAEMON';
}

/**
 * Convert a raw RFC 2822 message to its mboxrd body form: LF line endings,
 * ">"-quoted From lines, and a guaranteed trailing newline.
 */
export function transformEmlToMbox(raw: string): string {
  let body = raw.replace(/\r\n/g, '\n');
  body = body.replace(/^(>*From )/gm, '>$1');
  if (!body.endsWith('\n')) {
    body += '\n';
  }
  return body;
}

const MANIFEST_NAME = 'mbox-export-manifest.json';

// Files consumed (appended + deleted) per crash-safe cycle. Bounds the disk
// held by staged files during large catch-up assemblies; matches the sync
// engine's export chunk size.
const SUB_BATCH_SIZE = 50;

export interface MboxExportManifest {
  version: 1;
  // Byte length of the mbox covering every consumed message; anything beyond
  // this offset is a torn append from a crash and is truncated on recovery.
  mboxBytes: number;
  // How many staged files have been appended to the mbox so far.
  consumedCount: number;
  // Filename of the last appended file. Staged filenames sort in export
  // order, so any staged file <= this name was already appended (its delete
  // didn't complete) and is removed on recovery rather than re-appended.
  lastConsumedName: string;
}

export function readMboxExportManifest(stagingDir: string): MboxExportManifest | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(stagingDir, MANIFEST_NAME), 'utf8');
  } catch (err) {
    // no manifest — no assembly has happened yet
    return null;
  }
  // An unreadable manifest must NOT be treated as a fresh export: that would
  // truncate the mbox to zero even though consumed messages exist only there.
  // Failing loudly preserves both the mbox and the remaining staged files.
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // fall through to the error below
  }
  if (!parsed || parsed.version !== 1 || typeof parsed.mboxBytes !== 'number') {
    throw new Error(`Unrecognized mbox export manifest in ${stagingDir}`);
  }
  return parsed as MboxExportManifest;
}

async function writeManifest(stagingDir: string, manifest: MboxExportManifest) {
  const dest = path.join(stagingDir, MANIFEST_NAME);
  const tmp = `${dest}.tmp`;
  const fh = await fs.promises.open(tmp, 'w');
  try {
    await fh.writeFile(JSON.stringify(manifest), 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.promises.rename(tmp, dest);
  // Make the rename durable before the caller deletes consumed files: on
  // power loss the deletes must never outlive the manifest that records
  // them. Directories can't be fsynced on Windows — best effort there.
  try {
    const dirHandle = await fs.promises.open(stagingDir, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch (err) {
    // EISDIR/EPERM on platforms that can't open directories
  }
}

/**
 * Append staged .eml files to the mbox in export order, then delete them.
 * Files are processed in lexicographic order — GetManyRFC2822Task names them
 * with a zero-padded index prefix, so this preserves the original mailbox
 * (UID) order. Each file's mtime is the message date (set by the export task)
 * and becomes the separator-line timestamp.
 *
 * `exportedCount` is the engine's persisted count of successfully exported
 * messages (task.progress.exported): staged files past that count may still
 * be mid-write by the sync engine and are left for a later call. Pass null
 * once the task has finished to consume everything that remains.
 *
 * Each call first recovers from any earlier interruption (truncates a torn
 * tail, deletes consumed leftovers), then consumes the eligible files in
 * crash-safe sub-batches: append the sub-batch, fsync, record the manifest,
 * and only then delete the consumed files. A crash before the manifest write
 * leaves the source files in place (the torn tail is truncated and
 * re-appended next time); a crash after it leaves only already-recorded
 * files to delete. Messages are therefore never lost or duplicated, and
 * because consumed files are deleted between sub-batches, disk usage beyond
 * the mbox itself stays bounded by the sub-batch window no matter how many
 * files have accumulated (e.g. when assembly was deferred and runs at
 * completion).
 *
 * Returns the number of staged messages remaining. The manifest and staging
 * directory are left in place; the caller removes them when the export ends.
 */
export async function appendStagedMessages(
  stagingDir: string,
  mboxPath: string,
  exportedCount: number | null
): Promise<number> {
  const manifest = readMboxExportManifest(stagingDir) || {
    version: 1 as const,
    mboxBytes: 0,
    consumedCount: 0,
    lastConsumedName: '',
  };

  let files = (await fs.promises.readdir(stagingDir))
    .filter((f) => f.toLowerCase().endsWith('.eml'))
    .sort();

  // Recovery: files at or before lastConsumedName are already in the mbox —
  // their deletion was interrupted. Remove them instead of re-appending.
  if (manifest.lastConsumedName) {
    for (const file of files) {
      if (file <= manifest.lastConsumedName) {
        await fs.promises.rm(path.join(stagingDir, file), { force: true });
      }
    }
    files = files.filter((f) => f > manifest.lastConsumedName);
  }

  const maxCount = exportedCount == null ? files.length : exportedCount - manifest.consumedCount;
  const batch = files.slice(0, Math.max(0, maxCount));

  // Recovery: reconcile the mbox with the manifest before appending.
  let mboxSize = 0;
  try {
    mboxSize = (await fs.promises.stat(mboxPath)).size;
  } catch (err) {
    // no mbox yet
  }
  if (mboxSize < manifest.mboxBytes) {
    throw new Error(
      `The mbox file is shorter than the ${manifest.mboxBytes} bytes already exported — it was moved or modified while the export was running.`
    );
  }

  // Read-write (not append) mode with explicitly positioned writes: append
  // mode would be simpler, but on Windows Node opens 'a' handles without
  // write-data access and the recovery truncate below can fail on them, and
  // O_APPEND positioning after ftruncate is exactly the kind of cross-
  // platform subtlety this file shouldn't depend on.
  const fh = await fs.promises.open(mboxPath, fs.constants.O_RDWR | fs.constants.O_CREAT);
  let offset = manifest.mboxBytes;
  let consumedCount = manifest.consumedCount;
  let lastConsumedName = manifest.lastConsumedName;
  try {
    if (mboxSize > manifest.mboxBytes) {
      // torn append from a crash (or a pre-existing file being overwritten,
      // when the manifest is fresh) — drop the unrecorded bytes
      await fh.truncate(manifest.mboxBytes);
    }
    for (let i = 0; i < batch.length; i += SUB_BATCH_SIZE) {
      const subBatch = batch.slice(i, i + SUB_BATCH_SIZE);
      for (const file of subBatch) {
        const filepath = path.join(stagingDir, file);
        const [buf, stat] = await Promise.all([
          fs.promises.readFile(filepath),
          fs.promises.stat(filepath),
        ]);
        const raw = buf.toString('latin1');
        const message =
          mboxFromLine(senderFromEml(raw), stat.mtime) + transformEmlToMbox(raw) + '\n';
        const chunk = Buffer.from(message, 'latin1');
        // write() may write fewer bytes than requested; the manifest offset
        // must reflect what actually reached the file
        let written = 0;
        while (written < chunk.length) {
          const { bytesWritten } = await fh.write(
            chunk,
            written,
            chunk.length - written,
            offset + written
          );
          written += bytesWritten;
        }
        offset += chunk.length;
      }
      await fh.sync();
      consumedCount += subBatch.length;
      lastConsumedName = subBatch[subBatch.length - 1];
      await writeManifest(stagingDir, {
        version: 1,
        mboxBytes: offset,
        consumedCount,
        lastConsumedName,
      });
      for (const file of subBatch) {
        await fs.promises.rm(path.join(stagingDir, file), { force: true }).catch(() => {});
      }
    }
  } finally {
    await fh.close();
  }

  if (batch.length === 0 && (mboxSize !== manifest.mboxBytes || manifest.consumedCount === 0)) {
    // nothing consumed, but record the truncation / claim a fresh mbox file
    await writeManifest(stagingDir, {
      version: 1,
      mboxBytes: offset,
      consumedCount,
      lastConsumedName,
    });
  }

  return files.length - batch.length;
}
