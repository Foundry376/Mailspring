import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import PreferencesKeymaps from '../internal_packages/preferences/lib/tabs/preferences-keymaps';
import {
  matchesQuery,
  runsOnKey,
} from '../internal_packages/preferences/lib/tabs/keymaps/shortcut-search';

describe('matchesQuery', function () {
  it('matches everything when nothing is typed', function () {
    expect(matchesQuery('Star', ['s'], '  ', 'linux')).toBe(true);
  });

  it("matches a command's name, ignoring case", function () {
    expect(matchesQuery('Mark as Read', ['shift+i'], 'mark AS', 'linux')).toBe(true);
    expect(matchesQuery('Star', ['s'], 'reply', 'linux')).toBe(false);
  });

  it('matches a key as it is written, with mod read for the platform', function () {
    expect(matchesQuery('Reply', ['mod+r'], 'Ctrl+R', 'linux')).toBe(true);
    expect(matchesQuery('Reply', ['mod+r'], 'cmd+r', 'darwin')).toBe(true);
    expect(matchesQuery('Reply', ['mod+r'], 'control+r', 'linux')).toBe(true);
    expect(matchesQuery('Bold', ['alt+b'], 'option+b', 'darwin')).toBe(true);
    expect(matchesQuery('Reply', ['mod+r'], 'ctrl+r', 'darwin')).toBe(false);
  });
});

describe('runsOnKey', function () {
  it('is the whole key, not part of one', function () {
    expect(runsOnKey(['s'], 's', 'linux')).toBe(true);
    expect(runsOnKey(['shift+s'], 's', 'linux')).toBe(false);
    expect(runsOnKey(['ctrl+k'], 'mod+k', 'linux')).toBe(true);
  });
});

describe('Searching the Shortcuts page', function () {
  let host: HTMLDivElement;
  let dir: string;
  const keys = {
    'core:archive-item': ['e'],
    'core:star-item': ['s'],
    'core:reply': ['r', 'mod+r'],
    'core:reply-all': ['a', 'mod+shift+r'],
  };

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-search-'));
    fs.writeFileSync(path.join(dir, 'keymap.json'), '{}');
    spyOn(AppEnv.keymaps, 'getUserKeymapPath').andReturn(path.join(dir, 'keymap.json'));
    spyOn(AppEnv.keymaps, 'getBindingsForCommand').andCallFake((c) => keys[c] || []);
    spyOn(AppEnv.keymaps, 'getBindingsForAllCommands').andReturn(keys);
    spyOn(AppEnv.keymaps, 'getDefaultBindingsForCommand').andCallFake((c) => keys[c] || []);
    spyOn(AppEnv.keymaps, 'suspendAllKeymaps');
    spyOn(AppEnv.keymaps, 'resumeAllKeymaps');
    host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(<PreferencesKeymaps config={{ get: () => 'Gmail', set: () => {} }} />, host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const rows = () =>
    [...host.querySelectorAll('.shortcut')].map(
      (r) => r.querySelector('.shortcut-name').textContent
    );
  const sectionTitles = () =>
    [...host.querySelectorAll('.shortcut-section-title')].map((t) => t.firstChild.textContent);
  const type = (text: string) => {
    const input = host.querySelector('.shortcut-search-input') as HTMLInputElement;
    ReactTestUtils.Simulate.change(input, { target: { value: text } } as any);
  };
  const findByKey = (key: string, code: number) => {
    ReactTestUtils.Simulate.click(host.querySelector('.find-by-key'));
    ReactTestUtils.Simulate.keyDown(host.querySelector('.shortcut-recorder'), {
      key,
      keyCode: code,
      which: code,
    });
    advanceClock(1000);
  };

  it('narrows the list to commands whose name matches, and hides empty sections', function () {
    type('snooze');
    expect(rows()).toEqual(['Snooze']);
    expect(sectionTitles()).toEqual(['Actions']);
  });

  it('narrows the list to commands with a key that matches', function () {
    type('ctrl+shift+r');
    expect(rows()).toEqual(['Reply All']);
  });

  it('hides the Clear links while searching, so they never clear rows out of sight', function () {
    expect(host.querySelectorAll('.clear-section').length).toBeGreaterThan(0);
    type('star');
    expect(host.querySelectorAll('.clear-section').length).toBe(0);
  });

  it('hides the Clear links while listing what a key runs', function () {
    findByKey('s', 83);
    expect(host.querySelectorAll('.clear-section').length).toBe(0);
  });

  it('starts Find by key from a clean list, dropping typed text', function () {
    type('snooze');
    findByKey('s', 83);
    ReactTestUtils.Simulate.click(host.querySelector('.clear-key-query'));
    expect(rows()).toContain('Star');
    expect((host.querySelector('.shortcut-search-input') as HTMLInputElement).value).toBe('');
  });

  it('says so when nothing matches', function () {
    expect(host.querySelector('.shortcut-no-matches')).toBe(null);
    type('zzz');
    expect(rows()).toEqual([]);
    expect(host.querySelector('.shortcut-no-matches').textContent).toBe('No shortcuts match.');
  });

  it('finds the commands a pressed key runs, with keymaps suspended while it listens', function () {
    findByKey('s', 83);
    expect(AppEnv.keymaps.suspendAllKeymaps).toHaveBeenCalled();
    expect(AppEnv.keymaps.resumeAllKeymaps).toHaveBeenCalled();
    expect(rows()).toEqual(['Star']);
    expect(host.querySelector('.shortcut-key-query').textContent).toContain('Runs on S');
  });

  it('says when nothing runs on the pressed key, and lists everything again once cleared', function () {
    findByKey('q', 81);
    expect(host.querySelector('.shortcut-no-matches').textContent).toBe('Nothing runs on Q.');
    ReactTestUtils.Simulate.click(host.querySelector('.clear-key-query'));
    expect(rows().length).toBeGreaterThan(4);
    expect(host.querySelector('.shortcut-search-input')).not.toBe(null);
  });

  it('goes back to the search box when Find by key is cancelled', function () {
    ReactTestUtils.Simulate.click(host.querySelector('.find-by-key'));
    ReactTestUtils.Simulate.keyDown(host.querySelector('.shortcut-recorder'), {
      key: 'Escape',
      keyCode: 27,
      which: 27,
    });
    expect(host.querySelector('.shortcut-recorder')).toBe(null);
    expect(host.querySelector('.shortcut-search-input')).not.toBe(null);
  });
});
