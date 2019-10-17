import { WorkspaceStore, ComponentRegistry } from 'mailspring-exports';
import BugReportRoot from './bug-report-root';

export function activate() {
  WorkspaceStore.defineSheet('Main', { root: true }, { list: ['Center'] });

  ComponentRegistry.register(BugReportRoot, {
    location: WorkspaceStore.Location.Center,
  });
}

export function deactivate() { }

export function serialize() { }
