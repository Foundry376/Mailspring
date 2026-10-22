import React from 'react';
import ReactDOM from 'react-dom';

import { QuickEventButton } from '../internal_packages/main-calendar/lib/quick-event-button';

describe('QuickEventButton', function () {
  let host: HTMLDivElement;
  let observed: { callback: () => void; target: Element }[];
  let RealResizeObserver: typeof ResizeObserver;

  // A hidden spec window reports resizes irregularly, so this one reports when the spec says so.
  class FakeResizeObserver {
    constructor(public callback: () => void) {}
    observe(target: Element) {
      observed.push({ callback: this.callback, target });
    }
    disconnect() {
      observed = observed.filter((o) => o.callback !== this.callback);
    }
  }

  const label = () => host.querySelector('.item-compose .text');
  const resize = (width: number) => {
    host.style.width = `${width}px`;
    for (const o of observed.filter((entry) => entry.target === host)) o.callback();
  };

  beforeEach(function () {
    observed = [];
    RealResizeObserver = window.ResizeObserver;
    (window as any).ResizeObserver = FakeResizeObserver;
    host = document.createElement('div');
    host.style.display = 'flex';
    document.body.appendChild(host);
    ReactDOM.render(
      <>
        <div style={{ width: 120, flexShrink: 0 }} />
        <div className="item-spacer" style={{ flex: 1 }} />
        <QuickEventButton />
      </>,
      host
    );
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    window.ResizeObserver = RealResizeObserver;
  });

  it('stops watching the toolbar once unmounted', function () {
    ReactDOM.unmountComponentAtNode(host);
    expect(observed.length).toBe(0);
  });

  it('drops its label when the toolbar has no room for it, and takes it back once it does', function () {
    resize(400);
    expect(label().textContent).toBe('New Event');
    const labelled = 120 + (host.querySelector('.item-compose') as HTMLElement).offsetWidth;

    resize(labelled - 10);
    expect(label()).toBe(null);
    expect(host.querySelector('.item-compose').getAttribute('aria-label')).toBe('New Event');

    resize(labelled - 5);
    expect(label()).toBe(null);

    resize(labelled);
    expect(label().textContent).toBe('New Event');
  });
});
