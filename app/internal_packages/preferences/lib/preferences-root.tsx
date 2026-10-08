import React from 'react';
import ReactDOM from 'react-dom';
import {
  Flexbox,
  ScrollRegion,
  KeyCommandsRegion,
  ListensToFluxStore,
  ConfigPropContainer,
} from 'mailspring-component-kit';
import { PreferencesUIStore } from 'mailspring-exports';
import PreferencesTabsBar from './preferences-tabs-bar';

const stopPropagation = (e: CustomEvent) => {
  e.stopPropagation();
};

// Commands that act on the mail list, which stays mounted behind Preferences: a Gmail-style
// "s" would star the thread selected there.
export const MAIL_COMMANDS = [
  'core:reply',
  'core:reply-all',
  'core:forward',
  'core:archive-item',
  'core:delete-item',
  'core:remove-from-view',
  'core:gmail-remove-from-view',
  'core:remove-and-previous',
  'core:remove-and-next',
  'core:star-item',
  'core:snooze-item',
  'core:change-labels',
  'core:change-folders',
  'core:mark-as-read',
  'core:mark-as-unread',
  'core:report-as-spam',
  'core:mark-important',
  'core:mark-unimportant',
  'core:print-thread',
  'thread-list:mark-all-as-read',
  'core:select-item',
  'core:select-up',
  'core:select-down',
  'multiselect-list:select-all',
  'multiselect-list:deselect-all',
  'thread-list:select-read',
  'thread-list:select-unread',
  'thread-list:select-starred',
  'thread-list:select-unstarred',
  'core:focus-item',
  'core:next-item',
  'core:previous-item',
  'core:find-in-thread',
  'core:messages-page-up',
  'core:messages-page-down',
  'core:list-page-up',
  'core:list-page-down',
];

class PreferencesRoot extends React.Component<{ tab: any; tabs: any[]; selection: any }> {
  static displayName = 'PreferencesRoot';

  // Reached after any list inside Preferences has handled the command for itself.
  _localHandlers = Object.fromEntries(MAIL_COMMANDS.map((command) => [command, stopPropagation]));

  // A command fired from outside Preferences, from the body when nothing here has focus,
  // never passes through it, so it is stopped on the way down instead.
  _stopCommandFromOutside = (e: CustomEvent) => {
    if (!(ReactDOM.findDOMNode(this) as HTMLElement).contains(e.target as Node)) {
      e.stopPropagation();
    }
  };

  _contentComponent: ConfigPropContainer;

  componentDidMount() {
    for (const command of MAIL_COMMANDS) {
      window.addEventListener(command, this._stopCommandFromOutside, true);
    }
    (ReactDOM.findDOMNode(this) as HTMLElement).focus();
    this._focusContent();
  }

  componentWillUnmount() {
    for (const command of MAIL_COMMANDS) {
      window.removeEventListener(command, this._stopCommandFromOutside, true);
    }
  }

  componentDidUpdate(oldProps: { tab: any; tabs: any[]; selection: any }) {
    if (oldProps.tab !== this.props.tab) {
      const scrollRegion = document.querySelector('.preferences-content .scroll-region-content');
      scrollRegion.scrollTop = 0;
      this._focusContent();
    }
  }

  // Focus the first thing with a tabindex when we update.
  // inside the content area. This makes it way easier to interact with prefs.
  _focusContent() {
    const contentEl = ReactDOM.findDOMNode(this._contentComponent) as HTMLElement;
    const node = contentEl.querySelector(
      'input, select, textarea, [tabindex="0"], button'
    ) as HTMLElement;
    if (node) {
      node.focus();
    }
  }

  render() {
    const { tab, selection, tabs } = this.props;
    const TabComponent = tab && tab.componentClassFn();

    return (
      <KeyCommandsRegion
        className="preferences-wrap"
        tabIndex={0}
        localHandlers={this._localHandlers}
      >
        <Flexbox direction="column">
          <PreferencesTabsBar tabs={tabs} selection={selection} />
          <ScrollRegion className="preferences-content">
            <ConfigPropContainer
              ref={(el) => {
                this._contentComponent = el;
              }}
            >
              {tab ? <TabComponent accountId={selection.accountId} /> : null}
            </ConfigPropContainer>
          </ScrollRegion>
        </Flexbox>
      </KeyCommandsRegion>
    );
  }
}

export default ListensToFluxStore(PreferencesRoot, {
  stores: [PreferencesUIStore],
  getStateFromStores() {
    const tabs = PreferencesUIStore.tabs();
    const selection = PreferencesUIStore.selection();
    const tab = tabs.find((t) => t.tabId === selection.tabId);
    return { tabs, selection, tab };
  },
});
