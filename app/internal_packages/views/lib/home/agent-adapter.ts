import { AgentActions, AgentSessionStore, homeUsageLine, newViewId } from '../agent';

export { newViewId };

export function startAuthoring(opts: { viewId: string; name: string; request: string }) {
  AgentActions.start(opts);
}

/** Whether the authoring agent is working on the View right now, for badges on home cards. */
export function isBuilding(viewId: string) {
  const session = AgentSessionStore.session(viewId);
  return !!(session && session.working);
}

export function listenToSessions(callback: () => void): () => void {
  return AgentSessionStore.listen(callback);
}

/** The Views home's allowance line, e.g. "3 of 10 Views this month · $1.20 of $8.00". */
export function usageLine(): string | null {
  const usage = AgentSessionStore.accountUsage();
  return usage ? homeUsageLine(usage) : null;
}

export function refreshUsage() {
  AgentActions.refreshUsage();
}
