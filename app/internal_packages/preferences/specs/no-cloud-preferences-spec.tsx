import React from 'react';
import ReactDOM from 'react-dom';
import {
  AccountStore,
  ComponentRegistry,
  PreferencesUIStore,
  WorkspaceStore,
} from 'mailspring-exports';
import { activate } from '../lib/main';
import PreferencesGeneral from '../lib/tabs/preferences-general';
import ConfigSchemaItem from '../lib/tabs/config-schema-item';

describe('Cloud-free preferences', () => {
  it('registers local preferences without a subscription tab', () => {
    const register = spyOn(PreferencesUIStore, 'registerPreferencesTab');
    spyOn(ComponentRegistry, 'register');
    spyOn(WorkspaceStore, 'defineSheet');
    activate();
    expect(register.calls.map((call) => call.args[0].tabId)).toEqual([
      'General',
      'Accounts',
      'Appearance',
      'Shortcuts',
      'Mail Rules',
    ]);
  });

  it('can open the settings menu without any mail accounts', () => {
    const register = spyOn(ComponentRegistry, 'register');
    spyOn(PreferencesUIStore, 'registerPreferencesTab');
    spyOn(WorkspaceStore, 'defineSheet');
    spyOn(AccountStore, 'accounts').andReturn([]);
    activate();
    const footer = register.calls.find((call) => call.args[1].role === 'NavRail:FooterItem');
    const menu = footer.args[0]().props.menuTemplate();
    expect(menu.some((item) => item.label && item.label.includes('Manage Accounts'))).toBe(true);
  });

  it('omits obsolete tracking notifications while preserving mail notifications', () => {
    const notifications = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', title: 'Mail notifications' },
        enabledForRepeatedTrackingEvents: { type: 'boolean', title: 'Repeated opens / clicks' },
      },
    };
    const config = { get: () => '', set: () => {}, toggle: () => {} };
    const general = new PreferencesGeneral({
      config,
      configSchema: { properties: { notifications } } as any,
    });
    let notificationElement: React.ReactElement;
    const find = (element: React.ReactNode) => {
      React.Children.forEach(element, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type === ConfigSchemaItem && child.props.keyPath === 'core.notifications') {
          notificationElement = child;
        }
        find(child.props.children);
      });
    };
    find(general.render());
    const container = document.createElement('div');
    try {
      ReactDOM.render(notificationElement, container);
      expect(container.querySelector('[id="core.notifications.enabled"]')).not.toBe(null);
      expect(
        container.querySelector('[id="core.notifications.enabledForRepeatedTrackingEvents"]')
      ).toBe(null);
      expect(notifications.properties.enabledForRepeatedTrackingEvents).toBeDefined();
    } finally {
      ReactDOM.unmountComponentAtNode(container);
    }
  });
});
