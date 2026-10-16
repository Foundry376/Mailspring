import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import CommandItem from '../internal_packages/preferences/lib/tabs/keymaps/command-item';
import PreferencesKeymaps from '../internal_packages/preferences/lib/tabs/preferences-keymaps';
import {
  addedBindings,
  findConflicts,
} from '../internal_packages/preferences/lib/tabs/keymaps/user-keymap';

describe('addedBindings', function () {
  it('is the keys beyond the default ones', function () {
    expect(addedBindings(['e', 's'], ['e'], 'linux')).toEqual(['s']);
  });

  it('treats mod and ctrl as one key on Windows and Linux', function () {
    expect(addedBindings(['ctrl+k'], ['mod+k'], 'linux')).toEqual([]);
    expect(addedBindings(['ctrl+k'], ['mod+k'], 'darwin')).toEqual(['ctrl+k']);
  });
});

describe('findConflicts', function () {
  it('reports an added key that another command has, on both commands', function () {
    const bindings = { 'core:archive-item': ['e', 's'], 'core:star-item': ['s'] };
    expect(findConflicts(bindings, { 'core:archive-item': ['s'] }, 'linux')).toEqual({
      'core:archive-item': { s: ['core:star-item'] },
      'core:star-item': { s: ['core:archive-item'] },
    });
  });

  it("leaves the defaults' own shared keys alone", function () {
    const bindings = { 'contenteditable:underline': ['ctrl+u'], 'core:mark-as-unread': ['ctrl+u'] };
    expect(findConflicts(bindings, {}, 'linux')).toEqual({});
    expect(findConflicts(bindings, { 'core:mark-as-unread': [] }, 'linux')).toEqual({});
  });

  it('matches another spelling of the same key', function () {
    const bindings = { 'core:archive-item': ['mod+k'], 'core:star-item': ['ctrl+k'] };
    expect(findConflicts(bindings, { 'core:archive-item': ['mod+k'] }, 'linux')).toEqual({
      'core:archive-item': { 'mod+k': ['core:star-item'] },
      'core:star-item': { 'ctrl+k': ['core:archive-item'] },
    });
    expect(findConflicts(bindings, { 'core:archive-item': ['mod+k'] }, 'darwin')).toEqual({});
  });

  it('names each other command once, however many spellings of the key it added', function () {
    const bindings = { a: ['mod+s', 'ctrl+s'], b: ['ctrl+s'] };
    expect(findConflicts(bindings, { a: ['mod+s', 'ctrl+s'] }, 'linux').b).toEqual({
      'ctrl+s': ['a'],
    });
  });
});

describe('Shortcut conflicts on the Shortcuts page', function () {
  let host: HTMLDivElement;
  let dir: string;
  let keymapPath: string;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-conflict-'));
    keymapPath = path.join(dir, 'keymap.json');
    spyOn(AppEnv.keymaps, 'getUserKeymapPath').andReturn(keymapPath);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const saved = () => JSON.parse(fs.readFileSync(keymapPath).toString());

  describe('a row', function () {
    const star = [{ command: 'core:star-item', label: 'Star' }];
    let onRemoveFrom: jasmine.Spy;

    const renderRow = (added: string[]) => {
      onRemoveFrom = jasmine.createSpy('onRemoveFrom');
      fs.writeFileSync(keymapPath, JSON.stringify({ 'core:archive-item': ['e', 's'] }));
      ReactDOM.render(
        <CommandItem
          command="core:archive-item"
          label="Archive"
          bindings={['e', 's']}
          customized
          added={added}
          conflicts={{ s: star }}
          onRemoveFrom={onRemoveFrom}
        />,
        host
      );
    };
    const chips = () => [...host.querySelectorAll('.shortcut-chip')] as HTMLElement[];

    it('marks the clashing key and names the other command', function () {
      renderRow(['e', 's']);
      expect(host.querySelectorAll('.shortcut-conflict').length).toBe(1);
      expect(chips().map((c) => c.classList.contains('conflict'))).toEqual([false, true]);
      expect(chips()[1].title).toBe('Also runs Star');
      expect(host.querySelector('.shortcut-conflict').textContent).toContain('also runs Star.');
    });

    it('removes the key from the other command', function () {
      renderRow(['s']);
      ReactTestUtils.Simulate.click(host.querySelector('.remove-from-others'));
      expect(onRemoveFrom).toHaveBeenCalledWith('core:star-item', 's');
    });

    it('removes the key from this command', function () {
      renderRow(['s']);
      ReactTestUtils.Simulate.click(host.querySelector('.remove-here'));
      expect(saved()['core:archive-item']).toEqual(['e']);
    });

    it('explains the clash only where the key was added', function () {
      renderRow([]);
      expect(chips()[1].classList.contains('conflict')).toBe(true);
      expect(host.querySelector('.shortcut-conflict')).toBe(null);
    });
  });

  describe('the page', function () {
    let all: { [command: string]: string[] };
    const allBindings = () => ({
      'core:archive-item': ['e', 's'],
      'core:star-item': ['s', '*'],
      'core:reply': ['r'],
      'contenteditable:underline': ['ctrl+u'],
      'core:mark-as-unread': ['ctrl+u'],
    });
    const defaults = {
      'core:archive-item': ['e'],
      'core:star-item': ['s', '*'],
      'core:reply': ['r'],
      'contenteditable:underline': ['ctrl+u'],
      'core:mark-as-unread': ['ctrl+u'],
    };
    const config = { get: () => 'Gmail', set: () => {} };
    const render = (userKeymap: object) => {
      fs.writeFileSync(keymapPath, JSON.stringify(userKeymap));
      ReactDOM.render(<PreferencesKeymaps config={config} />, host);
    };
    const row = (label: string) =>
      [...host.querySelectorAll('.shortcut')].find(
        (r) => r.querySelector('.shortcut-name').textContent === label
      );

    beforeEach(function () {
      all = allBindings();
      spyOn(AppEnv.keymaps, 'getBindingsForAllCommands').andCallFake(() => all);
      spyOn(AppEnv.keymaps, 'getBindingsForCommand').andCallFake((c) => all[c] || []);
      spyOn(AppEnv.keymaps, 'getDefaultBindingsForCommand').andCallFake((c) => defaults[c] || []);
    });

    it('counts and explains a key added to Archive that Star has', function () {
      render({ 'core:archive-item': ['e', 's'] });
      expect(host.querySelector('.shortcut-conflict-count').textContent).toBe(
        '1 shortcut you added also runs another command.'
      );
      expect(row('Archive').querySelector('.shortcut-conflict').textContent).toContain(
        'also runs Star.'
      );
      expect(row('Star').querySelector('.shortcut-chip.conflict')).not.toBe(null);
    });

    it('takes the key off the other command when asked', function () {
      render({ 'core:archive-item': ['e', 's'] });
      ReactTestUtils.Simulate.click(row('Archive').querySelector('.remove-from-others'));
      expect(saved()).toEqual({ 'core:archive-item': ['e', 's'], 'core:star-item': ['*'] });
    });

    it('counts every added key that clashes, once, whichever command it clashes with', function () {
      all['core:reply'] = ['r', 'e'];
      render({ 'core:archive-item': ['e', 's'], 'core:reply': ['r', 'e'] });
      expect(host.querySelector('.shortcut-conflict-count').textContent).toBe(
        '2 shortcuts you added also run other commands.'
      );
    });

    it('says nothing about the defaults sharing a key, even on a changed command', function () {
      all['core:mark-as-unread'] = ['ctrl+u', 'shift+u'];
      render({ 'core:mark-as-unread': ['ctrl+u', 'shift+u'] });
      expect(host.querySelector('.shortcut-conflict-count')).toBe(null);
      expect(host.querySelector('.shortcut-chip.conflict')).toBe(null);
    });
  });
});
