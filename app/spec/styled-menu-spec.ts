import { StyledMenu, StyledMenuItem } from '../src/styled-menu';

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.styled-menu-item'));
const labels = () => rows().map((row) => row.querySelector('.styled-menu-label').textContent);
const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

describe('StyledMenu', () => {
  afterEach(() => new StyledMenu().closePopup());

  it('renders visible items and collapses stray separators', () => {
    StyledMenu.buildFromTemplate([
      { type: 'separator' },
      { label: 'One', accelerator: 'CmdOrCtrl+R' },
      { label: 'Hidden', visible: false },
      { type: 'separator' },
      { type: 'separator' },
      { label: 'Two', type: 'checkbox', checked: true },
      { type: 'separator' },
    ]).popup({ x: 10, y: 10 });

    expect(labels()).toEqual(['One', 'Two']);
    expect(document.querySelectorAll('.styled-menu-separator').length).toBe(1);
    expect(rows()[0].querySelector('.styled-menu-shortcut').textContent).toBe('Ctrl+R');
    expect(rows()[1].getAttribute('aria-checked')).toBe('true');
  });

  it('supports the append API and closes after running an item', () => {
    const click = jasmine.createSpy('click');
    const closed = jasmine.createSpy('closed');
    const menu = new StyledMenu();
    menu.append(new StyledMenuItem({ label: 'Run', click }));
    menu.popup({ x: 10, y: 10, callback: closed });

    rows()[0].click();

    expect(click).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(document.querySelector('.styled-menu-layer')).toBe(null);
  });

  it('does not run disabled items', () => {
    const click = jasmine.createSpy('click');
    StyledMenu.buildFromTemplate([{ label: 'Off', enabled: false, click }]).popup({ x: 1, y: 1 });
    rows()[0].click();
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector('.styled-menu-layer')).not.toBe(null);
  });

  it('navigates by keyboard, skipping disabled items and opening submenus', () => {
    const click = jasmine.createSpy('click');
    StyledMenu.buildFromTemplate([
      { label: 'Off', enabled: false },
      { label: 'More', submenu: [{ label: 'Nested', click }] },
    ]).popup({ x: 1, y: 1 });

    press('ArrowDown');
    expect(rows()[1].classList.contains('active')).toBe(true);
    press('ArrowRight');
    expect(labels()).toContain('Nested');
    press('Enter');
    expect(click).toHaveBeenCalled();
  });

  it('keeps the menu inside the window', () => {
    StyledMenu.buildFromTemplate([{ label: 'Edge' }]).popup({
      x: window.innerWidth + 100,
      y: window.innerHeight + 100,
    });
    const { right, bottom } = document.querySelector('.styled-menu').getBoundingClientRect();
    expect(right).not.toBeGreaterThan(window.innerWidth);
    expect(bottom).not.toBeGreaterThan(window.innerHeight);
  });

  it('dismisses with Escape', () => {
    StyledMenu.buildFromTemplate([{ label: 'One' }]).popup({ x: 1, y: 1 });
    press('Escape');
    expect(document.querySelector('.styled-menu-layer')).toBe(null);
  });
});
