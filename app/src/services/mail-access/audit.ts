/**
 * In-memory log of calls made by consumers of mail data outside the plugin system: MCP
 * clients (`source: 'mcp'`) and Views (`source: 'view:<viewId>'`). Kept per source so a
 * chatty View can't push MCP entries out of the MCP preferences panel.
 */
export interface AuditEntry {
  timestamp: number;
  source: string;
  toolName: string;
  params: string;
  resultSummary: string;
  durationMs: number;
}

const MAX_ENTRIES_PER_SOURCE = 50;

const entriesBySource = new Map<string, AuditEntry[]>();
let listeners: (() => void)[] = [];

export function getAuditLog(source = 'mcp'): AuditEntry[] {
  return entriesBySource.get(source) || [];
}

export function clearAuditLog(source = 'mcp') {
  entriesBySource.delete(source);
  listeners.forEach((fn) => fn());
}

export function onAuditLogChanged(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function addAuditEntry(entry: Omit<AuditEntry, 'timestamp'>) {
  const entries = entriesBySource.get(entry.source) || [];
  entries.push({ timestamp: Date.now(), ...entry });
  if (entries.length > MAX_ENTRIES_PER_SOURCE) entries.shift();
  entriesBySource.set(entry.source, entries);
  listeners.forEach((fn) => fn());
}

/** Runs `fn` and records its params, outcome, and duration under `source`. */
export async function audited<T>(
  source: string,
  toolName: string,
  params: any,
  fn: () => Promise<T>,
  summarize: (result: T) => string = () => 'ok'
): Promise<T> {
  const start = Date.now();
  const record = (resultSummary: string) =>
    addAuditEntry({
      source,
      toolName,
      params: (JSON.stringify(params) || '').slice(0, 200),
      resultSummary,
      durationMs: Date.now() - start,
    });
  try {
    const result = await fn();
    record(summarize(result));
    return result;
  } catch (err) {
    record(`error: ${(err as Error).message}`.slice(0, 100));
    throw err;
  }
}
