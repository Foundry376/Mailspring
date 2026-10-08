import React from 'react';
import ReactDOM from 'react-dom';
import { PreferencesUIStore } from 'mailspring-exports';
import PreferencesRoot, {
  MAIL_COMMANDS,
} from '../internal_packages/preferences/lib/preferences-root';

describe('PreferencesRoot and the mail list behind it', function () {
  let host: HTMLDivElement;
  let onMailList: jasmine.Spy;
  let disposable: { dispose(): void };

  beforeEach(function () {
    host = document.createElement('div');
    document.body.appendChild(host);
    onMailList = jasmine.createSpy('onMailList');
    const handlers = Object.fromEntries(
      [...MAIL_COMMANDS, 'core:pop-sheet'].map((c) => [c, onMailList])
    );
    disposable = AppEnv.commands.add(document.body, handlers);
    PreferencesUIStore.registerPreferencesTab(
      new PreferencesUIStore.TabItem({
        tabId: 'Spec',
        displayName: 'Spec',
        componentClassFn: () => () => <div className="spec-tab" />,
      })
    );
    PreferencesUIStore.switchPreferencesTab('Spec');
    ReactDOM.render(<PreferencesRoot />, host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    disposable.dispose();
    PreferencesUIStore.unregisterPreferencesTab('Spec');
  });

  const wrap = () => host.querySelector('.preferences-wrap') as HTMLElement;

  it('keeps every mail command fired with nothing focused from the mail list', function () {
    for (const command of MAIL_COMMANDS) {
      (document.activeElement as HTMLElement).blur();
      AppEnv.commands.dispatch(command);
    }
    expect(onMailList).not.toHaveBeenCalled();
  });

  it('keeps every mail command fired inside Preferences from the mail list', function () {
    for (const command of MAIL_COMMANDS) {
      wrap().focus();
      AppEnv.commands.dispatch(command);
    }
    expect(onMailList).not.toHaveBeenCalled();
  });

  it('still lets a list inside Preferences move its own selection', function () {
    const list = document.createElement('div');
    list.tabIndex = 0;
    wrap().appendChild(list);
    const ownNext = jasmine.createSpy('ownNext');
    list.addEventListener('core:next-item', ownNext);
    list.focus();
    AppEnv.commands.dispatch('core:next-item');
    expect(ownNext).toHaveBeenCalled();
    expect(onMailList).not.toHaveBeenCalled();
  });

  it('lets other commands through, such as leaving Preferences', function () {
    (document.activeElement as HTMLElement).blur();
    AppEnv.commands.dispatch('core:pop-sheet');
    expect(onMailList).toHaveBeenCalled();
  });

  it('gives the mail list its commands back once Preferences closes', function () {
    ReactDOM.unmountComponentAtNode(host);
    (document.activeElement as HTMLElement).blur();
    AppEnv.commands.dispatch('core:star-item');
    expect(onMailList).toHaveBeenCalled();
  });
});
