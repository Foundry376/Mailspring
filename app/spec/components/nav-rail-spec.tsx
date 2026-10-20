import React from 'react';
import ReactDOM from 'react-dom';
import { Simulate } from 'react-dom/test-utils';
import { ipcRenderer } from 'electron';

import { NavRailItem, NavRailSection } from '../../src/components/nav-rail';

describe('NavRailItem', function navRailItem() {
  let container: HTMLDivElement;

  const render = (el: React.ReactElement) => {
    ReactDOM.render(el, container);
    return container.querySelector('button.nav-rail-item') as HTMLButtonElement;
  };
  const tooltip = () => document.body.querySelector('.nav-rail-tooltip');

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  it('shows the tooltip after a short hover, with its description, and hides it on leave', () => {
    const button = render(
      <NavRailItem
        label="Board"
        icon="📋"
        tooltip={{ title: 'Board', description: 'Sort conversations into columns.' }}
        active={false}
        onClick={() => {}}
      />
    );
    Simulate.mouseEnter(button);
    expect(tooltip()).toBe(null);
    advanceClock(400);
    expect(tooltip().textContent).toContain('Board');
    expect(tooltip().textContent).toContain('Sort conversations into columns.');
    expect(button.getAttribute('aria-describedby')).toEqual(tooltip().id);
    Simulate.mouseLeave(button);
    expect(tooltip()).toBe(null);
  });

  it('defaults the tooltip to the label', () => {
    const button = render(<NavRailItem label="Mail" iconName="inbox.png" active={false} />);
    Simulate.focus(button);
    advanceClock(400);
    expect(tooltip().textContent).toEqual('Mail');
    Simulate.blur(button);
  });

  it('runs onClick in place of an application command', () => {
    spyOn(ipcRenderer, 'send');
    const onClick = jasmine.createSpy('onClick');
    Simulate.click(render(<NavRailItem label="Board" icon="📋" onClick={onClick} active />));
    expect(onClick).toHaveBeenCalled();
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('sends its application command when it has no onClick', () => {
    spyOn(ipcRenderer, 'send');
    Simulate.click(
      render(<NavRailItem label="Mail" iconName="inbox.png" command="application:show-mail" />)
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith('command', 'application:show-mail');
  });

  it('marks the active item and draws a capped badge', () => {
    let button = render(<NavRailItem label="Board" icon="📋" active badge={7} />);
    expect(button.classList.contains('active')).toBe(true);
    expect(button.getAttribute('aria-current')).toEqual('page');
    expect(button.querySelector('.nav-rail-item-badge').textContent).toEqual('7');

    button = render(<NavRailItem label="Board" icon="📋" active={false} badge={240} />);
    expect(button.classList.contains('active')).toBe(false);
    expect(button.querySelector('.nav-rail-item-badge').textContent).toEqual('99+');

    button = render(<NavRailItem label="Board" icon="📋" active={false} badge={0} />);
    expect(button.querySelector('.nav-rail-item-badge')).toBe(null);
  });
});

describe('NavRailSection', function navRailSection() {
  it('groups its items under an accessible label', () => {
    const container = document.createElement('div');
    ReactDOM.render(
      <NavRailSection label="Views">
        <NavRailItem label="Views" iconName="plugins.png" active={false} />
      </NavRailSection>,
      container
    );
    const group = container.querySelector('.nav-rail-section');
    expect(group.getAttribute('role')).toEqual('group');
    expect(group.getAttribute('aria-label')).toEqual('Views');
    expect(group.querySelectorAll('.nav-rail-item').length).toEqual(1);
    ReactDOM.unmountComponentAtNode(container);
  });
});
