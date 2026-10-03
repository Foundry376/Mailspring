import { AgentActions, AgentSessionStore, newViewId } from '../agent';

export { newViewId };

export function startAuthoring(opts: { viewId: string; name: string; request: string }) {
  AgentActions.start(opts);
}

/**
 * Opens the authoring panel on the View: the session already loaded in this window, else the
 * View's server session with its transcript replayed. Starters and hand-written Views have no
 * server session yet; the panel stays open on an empty session and the user's first message
 * starts one, seeded with the View's current code.
 */
export async function editWithAI(viewId: string, name: string) {
  if (AgentSessionStore.session(viewId)) {
    AgentActions.setActive(viewId);
    return;
  }
  try {
    await AgentActions.resume(viewId, name);
  } catch (err) {
    if (err.code !== 'no_session') throw err;
  }
}

/** Whether the authoring agent is working on the View right now, for badges on home cards. */
export function isBuilding(viewId: string) {
  const session = AgentSessionStore.session(viewId);
  return !!(session && session.working);
}

export function listenToSessions(callback: () => void): () => void {
  return AgentSessionStore.listen(callback);
}
