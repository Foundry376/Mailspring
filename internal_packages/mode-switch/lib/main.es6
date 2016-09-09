import {ComponentRegistry, WorkspaceStore} from 'nylas-exports';
import {HasTutorialTip} from 'nylas-component-kit';

import ModeToggle from './mode-toggle';

const ToggleWithTutorialTip = HasTutorialTip(ModeToggle, {
  title: 'Compose with Context',
  instructions: "Great! This is our <b>Contextual Sidebar</b> with enriched contact profiles. These help you understand who you are emailing and makes it easy to see the message history you have with that person. <br/><br/><button class='btn' data-tutorial-id='proceed'>Got it!</button>",
});

// NOTE: this is a hack to allow ComponentRegistry
// to register the same component multiple times in
// different areas. if we do this more than once, let's
// dry this out.
class ToggleWithTutorialTipList extends ToggleWithTutorialTip {
  static displayName = 'ModeToggleList'
}

export function activate() {
  ComponentRegistry.register(ToggleWithTutorialTipList, {
    location: WorkspaceStore.Sheet.Thread.Toolbar.Right,
    modes: ['list'],
  });

  ComponentRegistry.register(ToggleWithTutorialTip, {
    location: WorkspaceStore.Sheet.Threads.Toolbar.Right,
    modes: ['split'],
  });
}
