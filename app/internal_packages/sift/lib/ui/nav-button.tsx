import React from 'react';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import { SparkleIcon, useStores } from './helpers';

export const SHEET_ID = 'Sift';

export function showSiftSheet() {
  Actions.selectRootSheet(WorkspaceStore.Sheet[SHEET_ID]);
}

/** Nav rail entry for the Sift view (NavRailItem only supports app commands). */
export function SiftNavButton() {
  useStores(WorkspaceStore);
  const active = WorkspaceStore.rootSheet() === WorkspaceStore.Sheet[SHEET_ID];
  return (
    <button
      className={`btn-icon nav-rail-item sift-nav-item${active ? ' active' : ''}`}
      title="Sift: ask your inbox"
      aria-label="Sift"
      aria-current={active ? 'page' : undefined}
      onClick={showSiftSheet}
    >
      <SparkleIcon size={18} />
    </button>
  );
}
SiftNavButton.displayName = 'SiftNavButton';
