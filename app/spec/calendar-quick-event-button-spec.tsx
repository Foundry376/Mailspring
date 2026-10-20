import React from 'react';
import ReactDOM from 'react-dom';

import { QuickEventButton } from '../internal_packages/main-calendar/lib/quick-event-button';

describe('QuickEventButton', function () {
  let host: HTMLDivElement;
  let button: QuickEventButton;

  const label = () => host.querySelector('.item-compose .text');
  const resize = (width: number) => {
    host.style.width = `${width}px`;
    button._fit();
  };

  beforeEach(function () {
    host = document.createElement('div');
    host.style.display = 'flex';
    document.body.appendChild(host);
    ReactDOM.render(
      <>
        <div style={{ width: 120, flexShrink: 0 }} />
        <div className="item-spacer" style={{ flex: 1 }} />
        <QuickEventButton ref={(b) => (button = b)} />
      </>,
      host
    );
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('drops its label when the toolbar has no room for it, and takes it back once it does', function () {
    resize(400);
    expect(label().textContent).toBe('New event');

    resize(150);
    expect(label()).toBe(null);
    expect(host.querySelector('.item-compose').getAttribute('aria-label')).toBe('New event');

    resize(170);
    expect(label()).toBe(null);

    resize(400);
    expect(label().textContent).toBe('New event');
  });
});
