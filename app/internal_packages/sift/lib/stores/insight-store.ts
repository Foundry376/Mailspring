import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';
import { AccountStore, CategoryStore, DatabaseStore, Thread } from 'mailspring-exports';
import { getApiKey, getSettings, hasApiKey, isExcludedSender } from '../settings';
import { loadThread } from '../mail/context';
import { triageThread, type Triage } from '../ai/triage';
import { currentModel, describeError, isBlockingError, isRateLimit } from '../ai/client';

export interface Insight extends Triage {
  threadId: string;
  /** Changes whenever the thread gets a new message, which invalidates the insight. */
  version: string;
  model: string;
  createdAt: number;
  /** Indexes of action items the user ticked off. */
  done?: number[];
}

type Status = 'queued' | 'running' | 'error' | 'skipped';

const CONCURRENCY = 3;
const MAX_THREADS_PER_ACCOUNT = 75;
const FILE_VERSION = 1;

export function threadVersion(thread: any) {
  const received = thread.lastMessageReceivedTimestamp?.valueOf?.() ?? 0;
  const sent = thread.lastMessageSentTimestamp?.valueOf?.() ?? 0;
  return `${received}|${sent}`;
}

/**
 * Holds AI triage results for threads and keeps them fresh.
 *
 * The main window owns the work queue: it triages recent inbox threads in the
 * background and re-triages a thread when it receives new mail. Results are
 * written to <config>/sift/insights.json, which other windows (composer,
 * thread popouts) read and watch.
 */
class InsightStore extends MailspringStore {
  private insights = new Map<string, Insight>();
  private status = new Map<string, Status>();
  private errors = new Map<string, string>();
  private queue: string[] = [];
  private running = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private unlisteners: Array<() => void> = [];
  private watcher: fs.FSWatcher | null = null;
  private isWorker = false;

  /** Why background triage is paused (for example, no API key), if it is. */
  blockedReason: string | null = null;

  get filePath() {
    return path.join(AppEnv.getConfigDirPath(), 'sift', 'insights.json');
  }

  activate() {
    this.load();
    // Load the key once so hasApiKey() is accurate, then let the UI catch up.
    getApiKey().then(() => this.trigger());
    this.isWorker = AppEnv.isMainWindow();
    if (this.isWorker) {
      const unlistenDb = DatabaseStore.listen((change: any) => {
        if (change.objectClass === Thread.name) this.scheduleScan(4000);
      });
      this.unlisteners.push(unlistenDb);
      const sub = AppEnv.config.onDidChange('sift', () => this.scheduleScan(500));
      this.unlisteners.push(() => sub.dispose());
      this.scheduleScan(3000);
    } else {
      this.watchFile();
    }
  }

  deactivate() {
    this.unlisteners.forEach((u) => u());
    this.unlisteners = [];
    this.watcher?.close();
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.flushSave();
  }

  // ---- Reading -----------------------------------------------------------

  get(threadId: string): Insight | undefined {
    return this.insights.get(threadId);
  }

  statusFor(threadId: string): Status | undefined {
    return this.status.get(threadId);
  }

  errorFor(threadId: string): string | undefined {
    return this.errors.get(threadId);
  }

  all(): Insight[] {
    return [...this.insights.values()];
  }

  threadIdsWhere(pred: (i: Insight) => boolean): string[] {
    return this.all()
      .filter(pred)
      .map((i) => i.threadId);
  }

  isFresh(thread: any) {
    const insight = this.insights.get(thread.id);
    return !!insight && insight.version === threadVersion(thread);
  }

  // ---- Writing -----------------------------------------------------------

  /** Re-run triage for one thread now, even if its insight is current. */
  refresh(threadId: string) {
    this.insights.delete(threadId);
    this.enqueue(threadId, { front: true });
  }

  /** Make sure a thread the user opened gets triaged soon. */
  ensure(thread: any) {
    if (!thread || !hasApiKey() || this.isFresh(thread) || this.status.get(thread.id) === 'skipped')
      return;
    this.enqueue(thread.id, { front: true });
  }

  toggleDone(threadId: string, index: number) {
    const insight = this.insights.get(threadId);
    if (!insight) return;
    const done = new Set(insight.done || []);
    if (done.has(index)) done.delete(index);
    else done.add(index);
    this.insights.set(threadId, { ...insight, done: [...done] });
    this.persist();
    this.trigger();
  }

  clearAll() {
    this.insights.clear();
    this.status.clear();
    this.errors.clear();
    this.queue = [];
    this.persist();
    this.trigger();
    this.scheduleScan(500);
  }

  resume() {
    this.blockedReason = null;
    this.trigger();
    this.scheduleScan(100);
  }

  // ---- Queue -------------------------------------------------------------

  private scheduleScan(delay: number) {
    if (!this.isWorker) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scanInbox(), delay);
  }

  /** Queue every recent inbox thread whose insight is missing or stale. */
  private async scanInbox() {
    const { autoTriage, triageDays } = getSettings();
    if (!autoTriage || !hasApiKey()) return;
    const since = new Date(Date.now() - triageDays * 24 * 60 * 60 * 1000);
    for (const account of AccountStore.accounts() || []) {
      const inbox = CategoryStore.getInboxCategory(account.id);
      if (!inbox) continue;
      const threads = await DatabaseStore.findAll(Thread)
        .where([
          Thread.attributes.categories.contains(inbox.id),
          Thread.attributes.lastMessageReceivedTimestamp.greaterThan(since),
        ])
        .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
        .limit(MAX_THREADS_PER_ACCOUNT);
      for (const thread of threads) {
        if (
          !this.isFresh(thread) &&
          !['skipped', 'error'].includes(this.status.get(thread.id) as string)
        ) {
          this.enqueue(thread.id);
        }
      }
    }
  }

  private enqueue(threadId: string, { front = false } = {}) {
    const current = this.status.get(threadId);
    if (current === 'running') return;
    this.queue = this.queue.filter((id) => id !== threadId);
    if (front) this.queue.unshift(threadId);
    else this.queue.push(threadId);
    this.status.set(threadId, 'queued');
    this.errors.delete(threadId);
    this.trigger();
    this.pump();
  }

  private pump() {
    if (this.blockedReason) return;
    while (this.running < CONCURRENCY && this.queue.length) {
      const threadId = this.queue.shift() as string;
      this.running++;
      this.process(threadId).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async process(threadId: string) {
    this.status.set(threadId, 'running');
    this.trigger();
    try {
      const loaded = await loadThread(threadId);
      if (!loaded || loaded.messages.length === 0) {
        this.status.delete(threadId);
        return;
      }
      const { thread, messages } = loaded;
      if (messages.some((m) => (m.from || []).some((c: any) => isExcludedSender(c.email)))) {
        this.status.set(threadId, 'skipped');
        return;
      }
      const triage = await triageThread(thread, messages);
      const previous = this.insights.get(threadId);
      this.insights.set(threadId, {
        ...triage,
        threadId,
        version: threadVersion(thread),
        model: currentModel(),
        createdAt: Date.now(),
        // Keep ticks on items that survived a re-triage.
        done: previous?.action_items
          ? (previous.done || []).filter(
              (i) => triage.action_items[i]?.text === previous.action_items[i]?.text
            )
          : [],
      });
      this.status.delete(threadId);
      this.persist();
    } catch (err) {
      if (isBlockingError(err)) {
        // Nothing will succeed until the user fixes their key or credits: pause the queue.
        this.blockedReason = describeError(err);
        this.queue.unshift(threadId);
        this.status.set(threadId, 'queued');
      } else if (isRateLimit(err)) {
        this.status.set(threadId, 'queued');
        setTimeout(() => this.enqueue(threadId), 30_000);
      } else {
        console.warn(`[sift] triage failed for ${threadId}`, err);
        this.status.set(threadId, 'error');
        this.errors.set(threadId, describeError(err));
      }
    } finally {
      this.trigger();
    }
  }

  // ---- Persistence -------------------------------------------------------

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (raw.version !== FILE_VERSION) return;
      this.insights = new Map(raw.insights.map((i: Insight) => [i.threadId, i]));
    } catch {
      // First run, or an unreadable cache: start empty.
    }
  }

  private persist() {
    if (!this.isWorker && !AppEnv.isMainWindow()) {
      // Secondary windows only write user edits (ticked items) immediately.
      this.flushSave();
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 1000);
  }

  private flushSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, insights: this.all() }));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[sift] could not save insights', err);
    }
  }

  private watchFile() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.watcher = fs.watch(path.dirname(this.filePath), (_event, file) => {
        if (file === 'insights.json') {
          this.load();
          this.trigger();
        }
      });
    } catch {
      // Watching is best-effort; the window still shows what it loaded.
    }
  }
}

export const insightStore = new InsightStore();
