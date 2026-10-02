import { ipcRenderer } from 'electron';
import { FeatureUsageStore } from 'mailspring-exports';

/**
 * Renderer side of the extraction service in app/src/browser/extraction-service.ts, plus the
 * local `smart-extraction` meter (docs/plans/sandboxed-views-exploration.md §14.3).
 */

export interface ModelAnswer {
  messageId: string;
  value: { [field: string]: any } | null;
  cached: boolean;
  ms: number;
}

export interface ExtractionStatus {
  available: boolean;
  modelVersion: string;
  downloading: boolean;
  download: { received: number; total: number };
  queued: number;
}

export function extractionStatus(): Promise<ExtractionStatus> {
  return ipcRenderer.invoke('extraction:status');
}

/** Answers in item order; null for items the service dropped (cancelled). */
export function runModel(req: {
  viewId: string;
  priority: number;
  schemaHash: string;
  jsonSchema: object;
  items: { messageId: string; prompt: string }[];
  cacheOnly?: boolean;
}): Promise<(ModelAnswer | null)[]> {
  return ipcRenderer.invoke('extraction:run', req);
}

export function cancelModelJobsForView(viewId: string): Promise<number> {
  return ipcRenderer.invoke('extraction:cancel-view', viewId);
}

// The server-side count (§14.3) arrives with the metadata contract. Until then usage is
// counted per calendar month in this browser profile, which is enough to exercise the
// quota path and its upgrade prompt.
function periodKey() {
  const now = new Date();
  return `views.smartExtraction.${now.getFullYear()}-${now.getMonth() + 1}`;
}

export function unitsUsedThisPeriod(): number {
  try {
    return Number(window.localStorage.getItem(periodKey())) || 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Whether one more message may go to the model. `core.views.extractQuotaForTesting` (a
 * number) overrides the Mailspring ID quota so the partial-results path can be tested.
 */
export function canSpendUnit(): boolean {
  const testQuota = AppEnv.config.get('core.views.extractQuotaForTesting');
  if (typeof testQuota === 'number') return unitsUsedThisPeriod() < testQuota;
  return FeatureUsageStore.isUsable('smart-extraction');
}

export function spendUnits(count: number) {
  if (count <= 0) return;
  try {
    window.localStorage.setItem(periodKey(), String(unitsUsedThisPeriod() + count));
  } catch (err) {
    // storage unavailable; the meter is advisory until the server enforces it
  }
}
