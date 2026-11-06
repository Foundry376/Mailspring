import React from 'react';
import { ComponentRegistry } from 'mailspring-exports';
import { SidebarPanels } from '../lib/sidebar-panels';

const CalendarPanel = Object.assign(() => null, {
  sidebarPanel: { id: 'calendar', title: 'Calendar' },
});

describe('SidebarPanels', function () {
  let saved: string;
  let panels: SidebarPanels;

  // The panel the switcher shows, and the claim it hands that panel.
  const rendered = () => {
    const tree = panels.render();
    const tabs = tree.props.children[0].props.children;
    const calendar = tree.props.children[1][0];
    return {
      active: tabs.find((t: React.ReactElement) => t.props['aria-selected']).key,
      claimActive: calendar.props.children.props.claimActive,
      select: (id: string) => tabs.find((t: React.ReactElement) => t.key === id).props.onClick(),
    };
  };

  beforeEach(function () {
    saved = 'contact';
    spyOn(ComponentRegistry, 'findComponentsMatching').andReturn([CalendarPanel]);
    spyOn(AppEnv.config, 'get').andCallFake(() => saved);
    spyOn(AppEnv.config, 'set').andCallFake((_key: string, id: string) => {
      saved = id;
      panels.state.activeId = id;
    });
    panels = new SidebarPanels({});
    panels.setState = (update: any) =>
      Object.assign(panels.state, typeof update === 'function' ? update(panels.state) : update);
  });

  it('shows a claiming panel without changing the remembered one, and returns to it after', function () {
    rendered().claimActive(true);
    expect(rendered().active).toBe('calendar');
    expect(AppEnv.config.set).not.toHaveBeenCalled();

    rendered().claimActive(false);
    expect(rendered().active).toBe('contact');
  });

  it('ends the claim when a tab is picked', function () {
    rendered().claimActive(true);
    rendered().select('contact');
    expect(AppEnv.config.set).toHaveBeenCalledWith('core.messageListSidebar.panel', 'contact');
    expect(rendered().active).toBe('contact');

    // Picking the tab already shown keeps the claim, and the remembered tab with it.
    rendered().claimActive(true);
    rendered().select('calendar');
    expect(saved).toBe('contact');
    rendered().claimActive(false);
    expect(rendered().active).toBe('contact');
  });
});
