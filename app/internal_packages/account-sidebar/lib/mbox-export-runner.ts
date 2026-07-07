import fs from 'fs';
import { localized, Task, TaskQueue, GetManyRFC2822Task, MboxUtils } from 'mailspring-exports';

/*
 * Finishes mbox folder exports. The sync engine's half of an export (fetching
 * each message to a .eml file in the staging directory) is a persisted task
 * that survives restarts, so the client half — assembling the staged files
 * into the final mbox — must too. This runner watches the TaskQueue and
 * advances any mbox export whose staging directory exists, whether the task
 * was queued this session or resumed from a previous one.
 *
 * Assembly is incremental to keep disk usage down: each time the engine
 * persists export progress (every 50 messages), the staged files covered by
 * that progress are appended to the mbox and deleted, so the staging
 * directory holds a ~50-message window rather than a full second copy of the
 * folder. The engine writes staged files in export order with sorted names
 * and reports progress only after a chunk is fully on disk, so files within
 * the reported count are complete. Two gates keep this safe:
 *
 * - progress.exported bounds how many staged files are consumed; anything
 *   past it may still be mid-write by the engine.
 * - If any message failed (progress.failed > 0), incremental consumption
 *   stops and the remaining staging is assembled only at completion: after a
 *   restart the engine reuses filename index prefixes of failed messages, so
 *   name order stops being trustworthy while files are still being written.
 *   (Deferred assembly still consumes in bounded sub-batches, so peak disk
 *   stays near folder size even then — see appendStagedMessages.)
 *
 * Assembly writes to a `<destination>.incomplete` working file; the file the
 * user chose is created only by an atomic rename at successful completion,
 * so a partially assembled mailbox can never be mistaken for a finished one
 * (deferred assembly can run for a while after the fetch completes), and a
 * pre-existing file at the destination survives cancellation and failure.
 * Completion assembles whatever remains, renames, and removes the staging
 * directory; cancellation discards the staging directory and the working
 * file. A failed assembly keeps the working file and staging — together they
 * hold every fetched message — and resumes at the next launch.
 */

const inFlight = new Set<string>();
// Failed assemblies must not retry on every queue change — the user was
// already shown the error. The staging dir and manifest persist, so the next
// launch retries once.
const failedThisSession = new Set<string>();
// progress.exported at the last append per task, so sweeps triggered by
// unrelated queue changes don't re-scan the staging directory.
const lastAppendedAt = new Map<string, number>();

let unlisten: (() => void) | null = null;

export function activateMboxExportRunner() {
  unlisten = TaskQueue.listen(sweep);
  sweep();
}

export function deactivateMboxExportRunner() {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}

async function sweep() {
  for (const task of TaskQueue.allTasks()) {
    if (!(task instanceof GetManyRFC2822Task)) {
      continue;
    }
    const { id, status, format, mboxPath, outputDir, progress } = task;
    if (format !== 'mbox' || !mboxPath || !outputDir) {
      continue;
    }
    if (inFlight.has(id) || failedThisSession.has(id)) {
      continue;
    }
    if (!fs.existsSync(outputDir)) {
      lastAppendedAt.delete(id);
      continue;
    }

    // Assembly happens in a working file beside the destination; the file the
    // user chose appears only via an atomic rename once the export is
    // complete. Until then there is nothing at the chosen path that could be
    // mistaken for a finished mailbox, and a pre-existing file there is
    // replaced only by a successful export. The working file is derived from
    // the per-export staging directory (not from mboxPath) so it, too, is
    // unique to this task.
    const workingPath = outputDir.replace(/\.partial$/, '.incomplete');

    inFlight.add(id);
    try {
      // A mid-export cancel surfaces as status "complete" with
      // progress.cancelled set (the engine maps shouldCancel to the
      // cancelled status only before the export starts), so status alone
      // can't distinguish a finished export from one stopped on request.
      const wasCancelled =
        status === Task.Status.Cancelled || Boolean(progress && progress.cancelled);
      const finished = status === Task.Status.Complete || status === Task.Status.Cancelled;

      if (wasCancelled) {
        if (finished) {
          await fs.promises.rm(workingPath, { force: true }).catch(() => {});
          await fs.promises.rm(outputDir, { recursive: true, force: true });
          lastAppendedAt.delete(id);
        }
        // not finished yet: the engine is wrapping up — the sweep after the
        // status flip performs the cleanup
      } else if (status === Task.Status.Complete) {
        // A prior run may have already renamed the working file onto the
        // destination and crashed before removing staging — only cleanup is
        // left in that case.
        const alreadyInstalled =
          MboxUtils.readMboxExportManifest(outputDir) !== null &&
          !fs.existsSync(workingPath) &&
          fs.existsSync(mboxPath);

        if (!alreadyInstalled) {
          await MboxUtils.appendStagedMessages(outputDir, workingPath, null);

          // Only replace the destination with a genuinely complete export:
          // every message accounted for, none failed, not cancelled. This is
          // what keeps a failed/aborted/empty export from destroying a file
          // the user already had at that path.
          const result = task.result || {};
          const cleanSuccess =
            Boolean(task.result) &&
            (result.failed || 0) === 0 &&
            (result.exported || 0) === (result.total || 0);
          const workingSize = (await fs.promises.stat(workingPath)).size;
          const destinationExists = fs.existsSync(mboxPath);

          if (cleanSuccess && (workingSize > 0 || !destinationExists)) {
            // Complete export (or a legitimately empty folder to a new path).
            await fs.promises.rename(workingPath, mboxPath);
          } else if (!cleanSuccess) {
            // Preserve whatever is at the destination; keep the assembled
            // messages in the working file so nothing fetched is lost.
            failedThisSession.add(id);
            AppEnv.showErrorDialog(
              localized(
                'The mbox export did not complete, so the existing file at the destination was left unchanged. The messages exported so far are in %@.',
                workingPath
              )
            );
          } else {
            // Clean but empty, and a file already exists at the destination —
            // there is nothing to replace it with. Leave it untouched.
            await fs.promises.rm(workingPath, { force: true }).catch(() => {});
          }
        }
        await fs.promises.rm(outputDir, { recursive: true, force: true });
        lastAppendedAt.delete(id);
      } else {
        const exported = (progress && progress.exported) || 0;
        const failed = (progress && progress.failed) || 0;
        if (exported === 0 || failed > 0 || lastAppendedAt.get(id) === exported) {
          continue;
        }
        await MboxUtils.appendStagedMessages(outputDir, workingPath, exported);
        lastAppendedAt.set(id, exported);
      }
    } catch (err) {
      failedThisSession.add(id);
      AppEnv.showErrorDialog(
        localized(
          'Could not write the mbox file. The export will finish the next time Mailspring launches; the messages fetched so far remain in %@.',
          outputDir
        )
      );
    } finally {
      inFlight.delete(id);
    }
  }
}
