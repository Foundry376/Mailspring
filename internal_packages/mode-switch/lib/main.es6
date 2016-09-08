import {ServiceRegistry, ComponentRegistry, WorkspaceStore} from 'nylas-exports';
import ModeToggle from './mode-toggle';
import TutorialSegment from './tutorial-segment';

// NOTE: this is a hack to allow ComponentRegistry
// to register the same component multiple times in
// different areas. if we do this more than once, let's
// dry this out.
class ModeToggleList extends ModeToggle {
  static displayName = 'ModeToggleList'
}

export function activate() {
  ComponentRegistry.register(ModeToggleList, {
    location: WorkspaceStore.Sheet.Thread.Toolbar.Right,
    modes: ['list'],
  });

  ComponentRegistry.register(ModeToggle, {
    location: WorkspaceStore.Sheet.Threads.Toolbar.Right,
    modes: ['split'],
  });

  ServiceRegistry.withService('tutorial', (Tutorial) => {
    Tutorial.addSegment('mode-switch', TutorialSegment);
  });
}
