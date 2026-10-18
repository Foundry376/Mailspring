import { AgentActions, AgentSessionStore, LimitNotice, homeUsageLine, newViewId } from '../agent';

export { newViewId };

export function startAuthoring(opts: { viewId: string; name: string; request: string }) {
  AgentActions.start(opts);
}

/** Whether the authoring agent is working on the View right now, for badges on home cards. */
export function isBuilding(viewId: string) {
  const session = AgentSessionStore.session(viewId);
  return !!(session && session.working);
}

/**
 * Whether the agent is waiting on the user while the View's chat is closed: a revision held
 * until they come back to it, or a question for them.
 */
export function isWaitingForUser(viewId: string) {
  const session = AgentSessionStore.session(viewId);
  if (!session || AgentSessionStore.activeViewId() === viewId) return false;
  return !!session.pendingRequest || session.revisions.some((r) => r.status === 'applying');
}

export function listenToSessions(callback: () => void): () => void {
  return AgentSessionStore.listen(callback);
}

/** The Views home's allowance line, e.g. "3 of 10 Views this month · $1.20 of $8.00". */
export function usageLine(): string | null {
  const usage = AgentSessionStore.accountUsage();
  return usage ? homeUsageLine(usage) : null;
}

/** The free-plan limit that blocks starting a new View, or null when one can be built. */
export function upgradeNotice(): LimitNotice | null {
  return AgentSessionStore.newBuildUpgradeNotice();
}

export function showUpgrade(notice: LimitNotice) {
  AgentSessionStore.showUpgradeForNotice(notice);
}

/** Ends the View's authoring session in this window and drops its agent bookkeeping. */
export function forgetSession(viewId: string) {
  AgentSessionStore.forget(viewId);
}

export function refreshUsage() {
  AgentActions.refreshUsage();
}
