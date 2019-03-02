/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {
  Flexbox,
  ScrollRegion,
  KeyCommandsRegion,
  ListensToFluxStore,
  ConfigPropContainer,
} from 'mailspring-component-kit';
import { PreferencesUIStore } from 'mailspring-exports';
import PreferencesTabsBar from './preferences-tabs-bar';

const stopPropagation = e => {
  e.stopPropagation();
};

class PreferencesRoot extends React.Component<{ tab: any; tabs: any[]; selection: any }> {
  static displayName = 'PreferencesRoot';

  // This prevents some basic commands from propagating to the threads list and
  // producing unexpected results

  // TODO This is a partial/temporary solution and should go away when we do the
  // Keymap/Commands/Menu refactor
  _localHandlers = {
    'core:next-item': stopPropagation,
    'core:previous-item': stopPropagation,
    'core:select-up': stopPropagation,
    'core:select-down': stopPropagation,
    'core:select-item': stopPropagation,
    'core:messages-page-up': stopPropagation,
    'core:messages-page-down': stopPropagation,
    'core:list-page-up': stopPropagation,
    'core:list-page-down': stopPropagation,
    'core:remove-from-view': stopPropagation,
    'core:gmail-remove-from-view': stopPropagation,
    'core:remove-and-previous': stopPropagation,
    'core:remove-and-next': stopPropagation,
    'core:archive-item': stopPropagation,
    'core:delete-item': stopPropagation,
    'core:print-thread': stopPropagation,
  };

  _contentComponent: ConfigPropContainer;

  componentDidMount() {
    (ReactDOM.findDOMNode(this) as HTMLElement).focus();
    this._focusContent();
  }

  componentDidUpdate(oldProps) {
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
    const node = contentEl.querySelector('[tabindex]') as HTMLElement;
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
        tabIndex={1}
        localHandlers={this._localHandlers}
      >
        <Flexbox direction="column">
          <PreferencesTabsBar tabs={tabs} selection={selection} />
          <ScrollRegion className="preferences-content">
            <ConfigPropContainer
              ref={el => {
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
    const tab = tabs.find(t => t.tabId === selection.tabId);
    return { tabs, selection, tab };
  },
});
