import { SessionActionsLike, SessionStoreLike } from './types';

type Source = { store: SessionStoreLike; actions: SessionActionsLike };

/** The agent session store the panel renders, from `lib/agent`. */
export function panelSource(): Source | null {
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
