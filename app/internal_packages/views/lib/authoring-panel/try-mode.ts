import { ViewRegistryEvents } from '../view-registry';
import { ViewsNavStore } from '../views-nav';
import { panelSource } from './store';
import { AgentSessionState } from './types';
import { focusedPageViewId, isTryDraft, viewById } from './launch';

const untouched = (s: AgentSessionState) =>
  s.transcript.length === 0 && !s.working && !s.pendingRequest;

let lastFocused: string | null = null;

/**
 * Try mode: while a starter the user is trying is on screen, the panel shows its preview card
 * (Install, or Chat to customize). It appears on arrival and hides on leaving, without ever
 * contacting the agent. A conversation in progress about another View keeps the panel.
 */
export function syncTryMode() {
  const source = panelSource();
  if (!source || !source.actions.preview) return;
  const { store, actions } = source;
  const focused = focusedPageViewId();
  if (focused === lastFocused) return;
  const previous = lastFocused;
  lastFocused = focused;

  const active = store.activeSession();
  if (previous && active && active.viewId === previous && active.intro && untouched(active)) {
    actions.setActive(null);
  }

  const view = focused ? viewById(focused) : null;
  if (!isTryDraft(view)) return;
  const current = store.activeSession();
  if (current && current.viewId !== view.id && !untouched(current)) return;
  actions.preview(view.id, view.name, 'try');
}

let unsubscribers: (() => void)[] = [];

export function activateTryMode() {
  // Covers the draft landing after its View is focused, and relaunching onto one. Registry
  // changes are frequent (drafts, hot reloads), so this only opens a View's first preview;
  // a preview the user closed comes back when they next arrive at the View.
  const onRegistry = () => {
    const source = panelSource();
    const focused = focusedPageViewId();
    if (!source || !source.actions.preview || !focused || source.store.session(focused)) return;
    const view = viewById(focused);
    if (!isTryDraft(view)) return;
    const current = source.store.activeSession();
    if (current && !untouched(current)) return;
    source.actions.preview(view.id, view.name, 'try');
  };
  unsubscribers = [ViewsNavStore.listen(syncTryMode)];
  ViewRegistryEvents.on('changed', onRegistry);
  unsubscribers.push(() => ViewRegistryEvents.removeListener('changed', onRegistry));
  syncTryMode();
  onRegistry();
}

export function deactivateTryMode() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  lastFocused = null;
}
