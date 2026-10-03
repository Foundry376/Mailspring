import { SessionActionsLike, SessionStoreLike } from './types';

type Source = { store: SessionStoreLike; actions: SessionActionsLike };

let override: Source | null = null;
const sourceListeners = new Set<() => void>();

/**
 * The agent session store the panel renders. `lib/agent` is the real one; the dev demo
 * (`$m.ViewsAuthoringPanelDemo`) swaps in a scripted fake so every panel state can be seen
 * without a backend.
 */
export function panelSource(): Source | null {
  if (override) return override;
  try {
    // Resolved lazily so the panel still loads when the agent transport fails to.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const agent = require('../agent');
    if (agent && agent.AgentSessionStore && agent.AgentActions) {
      return { store: agent.AgentSessionStore, actions: agent.AgentActions };
    }
  } catch (err) {
    console.warn(`Views authoring panel: agent transport unavailable (${err.message})`);
  }
  return null;
}

export function setPanelSourceOverride(next: Source | null) {
  override = next;
  sourceListeners.forEach((cb) => cb());
}

export function onPanelSourceChanged(cb: () => void) {
  sourceListeners.add(cb);
  return () => sourceListeners.delete(cb);
}
