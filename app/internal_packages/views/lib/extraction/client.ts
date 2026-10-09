import { ipcRenderer } from 'electron';

/**
 * Renderer side of the extraction service in app/src/browser/extraction-service.ts. Model work
 * runs on this device and is not metered.
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
  // A View asking for the model counts as opening Views: it starts the first download.
  ipcRenderer.invoke('local-model:views-opened').catch(() => {});
  return ipcRenderer.invoke('extraction:status');
}

/** Answers in item order; null for items the service dropped (cancelled). */
export function runModel(req: {
  viewId: string;
  priority: number;
  schemaHash: string;
  /** Null asks for free text, answered as `{ text }`. */
  jsonSchema: object | null;
  items: { messageId: string; prompt: string }[];
  cacheOnly?: boolean;
  maxTokens?: number;
}): Promise<(ModelAnswer | null)[]> {
  return ipcRenderer.invoke('extraction:run', req);
}

export function cancelModelJobsForView(viewId: string): Promise<number> {
  return ipcRenderer.invoke('extraction:cancel-view', viewId);
}
