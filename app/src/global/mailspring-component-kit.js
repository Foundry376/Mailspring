/* eslint global-require: 0 */
/* eslint import/no-dynamic-require: 0 */

// This module exports an empty object, with a ton of defined properties that
// `require` files the first time they're called.
module.exports = exports = {};

// Because requiring files the first time they're used hurts performance, we
// automatically load components slowly in the background using idle cycles.
if (AppEnv.isMainWindow()) {
  setTimeout(() => {
    const remaining = Object.keys(module.exports);
    const fn = deadline => {
      let key = null;
      let bogus = 0; // eslint-disable-line
      while ((key = remaining.pop())) {
        bogus += module.exports[key] ? 1 : 0;
        if (deadline.timeRemaining() <= 0) {
          window.requestIdleCallback(fn, { timeout: 5000 });
          return;
        }
      }
    };
    window.requestIdleCallback(fn, { timeout: 5000 });
  }, 500);
} else {
  // just wait for them to be required
}

const resolveExport = (requireValue, name) => {
  return requireValue.default || requireValue[name] || requireValue;
};

const lazyLoadWithGetter = (prop, getter) => {
  const key = `${prop}`;

  if (exports[key]) {
    throw new Error(`Fatal error: Duplicate entry in mailspring-exports: ${key}`);
  }
  Object.defineProperty(exports, prop, {
    configurable: true,
    enumerable: true,
    get: () => {
      const value = getter();
      Object.defineProperty(exports, prop, { enumerable: true, value });
      return value;
    },
  });
};

const lazyLoad = (prop, path) => {
  lazyLoadWithGetter(prop, () => resolveExport(require(`../components/${path}`), prop));
};

const lazyLoadFrom = (prop, path) => {
  lazyLoadWithGetter(prop, () => {
    const bare = require(`../components/${path}`);
    return bare[prop] ? bare[prop] : bare.default[prop];
  });
};

lazyLoad('Menu', 'menu');
lazyLoad('ContactProfilePhoto', 'contact-profile-photo');
lazyLoad('DropZone', 'drop-zone');
lazyLoad('Spinner', 'spinner');
lazyLoad('Switch', 'switch');
lazyLoad('FixedPopover', 'fixed-popover');
lazyLoad('DatePickerPopover', 'date-picker-popover');
lazyLoad('Modal', 'modal');
lazyLoad('Webview', 'webview');
lazyLoad('FeatureUsedUpModal', 'feature-used-up-modal');
lazyLoad('BillingModal', 'billing-modal');
lazyLoad('OpenIdentityPageButton', 'open-identity-page-button');
lazyLoad('Flexbox', 'flexbox');
lazyLoad('RetinaImg', 'retina-img');
lazyLoad('SwipeContainer', 'swipe-container');
lazyLoad('FluxContainer', 'flux-container');
lazyLoad('FocusContainer', 'focus-container');
lazyLoad('SyncingListState', 'syncing-list-state');
lazyLoad('EmptyListState', 'empty-list-state');
lazyLoad('ListTabular', 'list-tabular');
lazyLoad('Notification', 'notification');
lazyLoad('EventedIFrame', 'evented-iframe');
lazyLoad('ButtonDropdown', 'button-dropdown');
lazyLoad('MultiselectList', 'multiselect-list');
lazyLoad('BoldedSearchResult', 'bolded-search-result');
lazyLoad('MultiselectDropdown', 'multiselect-dropdown');
lazyLoad('KeyCommandsRegion', 'key-commands-region');
lazyLoad('BindGlobalCommands', 'bind-global-commands');
lazyLoad('TabGroupRegion', 'tab-group-region');
lazyLoad('InjectedComponent', 'injected-component');
lazyLoad('TokenizingTextField', 'tokenizing-text-field');
lazyLoad('ParticipantsTextField', 'participants-text-field');
lazyLoad('MultiselectToolbar', 'multiselect-toolbar');
lazyLoad('InjectedComponentSet', 'injected-component-set');
lazyLoad('MetadataComposerToggleButton', 'metadata-composer-toggle-button');
lazyLoad('ConfigPropContainer', 'config-prop-container');
lazyLoad('DisclosureTriangle', 'disclosure-triangle');
lazyLoad('EditableList', 'editable-list');
lazyLoad('DropdownMenu', 'dropdown-menu');
lazyLoad('OutlineViewItem', 'outline-view-item');
lazyLoad('OutlineView', 'outline-view');
lazyLoad('DateInput', 'date-input');
lazyLoad('DatePicker', 'date-picker');
lazyLoad('TimePicker', 'time-picker');
lazyLoad('Table', 'table/table');
lazyLoadFrom('TableRow', 'table/table');
lazyLoadFrom('TableCell', 'table/table');
lazyLoad('SelectableTable', 'selectable-table');
lazyLoadFrom('SelectableTableRow', 'selectable-table');
lazyLoadFrom('SelectableTableCell', 'selectable-table');
lazyLoad('EditableTable', 'editable-table');
lazyLoadFrom('EditableTableCell', 'editable-table');
lazyLoad('LazyRenderedList', 'lazy-rendered-list');
lazyLoadFrom('AttachmentItem', 'attachment-items');
lazyLoadFrom('ImageAttachmentItem', 'attachment-items');
lazyLoad('CodeSnippet', 'code-snippet');

lazyLoad('ComposerEditor', 'composer-editor/composer-editor');
lazyLoad('ComposerSupport', 'composer-editor/composer-support');

lazyLoad('ScrollRegion', 'scroll-region');
lazyLoad('ResizableRegion', 'resizable-region');

lazyLoadFrom('MailLabel', 'mail-label');
lazyLoadFrom('LabelColorizer', 'mail-label');
lazyLoad('MailLabelSet', 'mail-label-set');
lazyLoad('MailImportantIcon', 'mail-important-icon');

lazyLoad('ScenarioEditor', 'scenario-editor');

// Higher order components
lazyLoad('ListensToObservable', 'decorators/listens-to-observable');
lazyLoad('ListensToFluxStore', 'decorators/listens-to-flux-store');
lazyLoad('ListensToMovementKeys', 'decorators/listens-to-movement-keys');
lazyLoad('HasTutorialTip', 'decorators/has-tutorial-tip');
lazyLoad('CreateButtonGroup', 'decorators/create-button-group');
