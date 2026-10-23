import React from 'react';
import {
  Actions,
  DatabaseStore,
  FocusedPerspectiveStore,
  Thread,
  WorkspaceStore,
} from 'mailspring-exports';

/** Re-render whenever any of the given Mailspring stores trigger. */
export function useStores(...stores: Array<{ listen: (cb: () => void) => () => void }>) {
  const [, setVersion] = React.useState(0);
  React.useEffect(() => {
    const unlisteners = stores.map((s) => s.listen(() => setVersion((v) => v + 1)));
    return () => unlisteners.forEach((u) => u());
  }, stores);
}

/** Show a thread in the main mail view, wherever the user currently is. */
export async function openThread(threadId: string) {
  // Models sometimes drop the "t:" prefix of Mailspring thread IDs in links.
  const thread =
    (await DatabaseStore.find(Thread, threadId)) ||
    (!threadId.startsWith('t:') ? await DatabaseStore.find(Thread, `t:${threadId}`) : null);
  if (!thread) return;
  if (!FocusedPerspectiveStore.isShowingMail()) FocusedPerspectiveStore.showMail();
  Actions.setFocus({ collection: 'thread', item: thread });
  if (WorkspaceStore.layoutMode() === 'list') {
    Actions.pushSheet(WorkspaceStore.Sheet.Thread);
  }
}

export function openPreferences() {
  Actions.openPreferences();
  Actions.switchPreferencesTab('Sift');
}

export const SparkleIcon = ({ size = 14 }: { size?: number }) => (
  <svg className="sift-sparkle" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2.5l1.9 5.6a2 2 0 0 0 1.3 1.3l5.6 1.9-5.6 1.9a2 2 0 0 0-1.3 1.3L12 20.1l-1.9-5.6a2 2 0 0 0-1.3-1.3L3.2 11.3l5.6-1.9a2 2 0 0 0 1.3-1.3L12 2.5z"
    />
    <path fill="currentColor" d="M19 2l.7 2 2 .7-2 .7L19 7.4l-.7-2-2-.7 2-.7L19 2z" opacity="0.7" />
  </svg>
);

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High priority',
  normal: 'Normal',
  low: 'Low priority',
};
