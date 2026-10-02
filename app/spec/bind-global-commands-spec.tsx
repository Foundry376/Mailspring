import React from 'react';
import { render, cleanup } from '@testing-library/react';

import BindGlobalCommands from '../src/components/bind-global-commands';

// The registry attaches listeners to document.body and dispatch() fires a bubbling event from
// document.activeElement, so these exercise the real registration rather than a stub.
describe('BindGlobalCommands', function () {
  afterEach(cleanup);

  const mount = (commands: { [name: string]: () => void }) =>
    render(
      <BindGlobalCommands commands={commands}>
        <div />
      </BindGlobalCommands>
    );

  const remount = (rerender, commands: { [name: string]: () => void }) =>
    rerender(
      <BindGlobalCommands commands={commands}>
        <div />
      </BindGlobalCommands>
    );

  it('runs the handler registered on mount', function () {
    const alpha = jasmine.createSpy('alpha');
    mount({ 'test:alpha': alpha });

    AppEnv.commands.dispatch('test:alpha');

    expect(alpha.calls.length).toBe(1);
  });

  it('runs the current handler after a re-render replaces the closures', function () {
    // The calendar rebuilds its commands object on every render, so the handler bound at
    // mount is stale immediately. Keeping it bound is what the removed `key` was hiding.
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');
    const { rerender } = mount({ 'test:alpha': first });

    remount(rerender, { 'test:alpha': second });
    AppEnv.commands.dispatch('test:alpha');

    expect(second.calls.length).toBe(1);
    expect(first.calls.length).toBe(0);
  });

  it('picks up a command added after mount', function () {
    const beta = jasmine.createSpy('beta');
    const { rerender } = mount({ 'test:alpha': () => {} });

    remount(rerender, { 'test:alpha': () => {}, 'test:beta': beta });
    AppEnv.commands.dispatch('test:beta');

    expect(beta.calls.length).toBe(1);
  });

  it('drops a command removed after mount', function () {
    const beta = jasmine.createSpy('beta');
    const { rerender } = mount({ 'test:alpha': () => {}, 'test:beta': beta });

    remount(rerender, { 'test:alpha': () => {} });
    AppEnv.commands.dispatch('test:beta');

    expect(beta.calls.length).toBe(0);
  });

  it('runs a handler once per dispatch however many times it re-renders', function () {
    // Re-binding without disposing first would stack duplicate listeners on document.body.
    const alpha = jasmine.createSpy('alpha');
    const { rerender } = mount({ 'test:alpha': alpha });

    remount(rerender, { 'test:alpha': alpha });
    remount(rerender, { 'test:alpha': alpha });
    remount(rerender, { 'test:alpha': alpha });
    AppEnv.commands.dispatch('test:alpha');

    expect(alpha.calls.length).toBe(1);
  });

  it('unregisters when it unmounts', function () {
    const alpha = jasmine.createSpy('alpha');
    const { unmount } = mount({ 'test:alpha': alpha });

    unmount();
    AppEnv.commands.dispatch('test:alpha');

    expect(alpha.calls.length).toBe(0);
  });
});
