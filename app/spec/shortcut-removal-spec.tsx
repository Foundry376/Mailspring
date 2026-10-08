import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import CommandItem from '../internal_packages/preferences/lib/tabs/keymaps/command-item';
import PreferencesKeymaps from '../internal_packages/preferences/lib/tabs/preferences-keymaps';
import displayedKeybindings from '../internal_packages/preferences/lib/tabs/keymaps/displayed-keybindings';
import {
  pressedKeys,
  withoutBinding,
  clearedKeymap,
} from '../internal_packages/preferences/lib/tabs/keymaps/user-keymap';

describe('pressedKeys', function () {
  it('reads mod as Cmd on macOS and Ctrl elsewhere', function () {
    expect(pressedKeys('mod+a', 'darwin')).toBe('command+a');
    expect(pressedKeys('mod+a', 'linux')).toBe('ctrl+a');
  });
});

describe('withoutBinding', function () {
  it('removes the key and every other spelling of it', function () {
    expect(withoutBinding(['mod+a', 'ctrl+a', 'x'], 'mod+a', 'linux')).toEqual(['x']);
    expect(withoutBinding(['mod+a', 'ctrl+a', 'x'], 'mod+a', 'darwin')).toEqual(['ctrl+a', 'x']);
  });
});

describe('clearedKeymap', function () {
  it('gives each command no keys and keeps the rest of the keymap', function () {
    const keymap = { 'core:star-item': ['s'] };
    expect(clearedKeymap(keymap, ['core:archive-item'])).toEqual({
      'core:star-item': ['s'],
      'core:archive-item': [],
    });
    expect(keymap).toEqual({ 'core:star-item': ['s'] });
  });
});

describe('Removing shortcuts on the Shortcuts page', function () {
  let host: HTMLDivElement;
  let dir: string;
  let keymapPath: string;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-remove-'));
    keymapPath = path.join(dir, 'keymap.json');
    fs.writeFileSync(keymapPath, JSON.stringify({ 'core:star-item': ['s'] }));
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
  const renderRow = (bindings: string[], customized = false) =>
    ReactDOM.render(
      <CommandItem
        command="core:archive-item"
        label="Archive"
        bindings={bindings}
        customized={customized}
        added={[]}
        conflicts={{}}
        onRemoveFrom={() => {}}
      />,
      host
    );
  const removeButtons = () => [...host.querySelectorAll('.remove-shortcut')] as HTMLElement[];

  describe('one command', function () {
    it('removes one key and keeps the others', function () {
      renderRow(['e', 'k']);
      ReactTestUtils.Simulate.click(removeButtons()[0]);
      expect(saved()).toEqual({ 'core:star-item': ['s'], 'core:archive-item': ['k'] });
    });

    it('leaves a command with no keys once its last one is removed', function () {
      renderRow(['e']);
      ReactTestUtils.Simulate.click(removeButtons()[0]);
      expect(saved()['core:archive-item']).toEqual([]);
    });

    if (process.platform !== 'darwin') {
      it('shows mod+a and ctrl+a as the one key they are, and removes both', function () {
        renderRow(['mod+a', 'ctrl+a']);
        expect(removeButtons().length).toBe(1);
        ReactTestUtils.Simulate.click(removeButtons()[0]);
        expect(saved()['core:archive-item']).toEqual([]);
      });
    }

    it('shows None for a command with no keys', function () {
      renderRow([]);
      expect(host.querySelector('.values').textContent).toBe('None');
    });

    it('offers Reset only once the command differs from the template', function () {
      renderRow(['e']);
      expect(host.querySelector('.reset-shortcut')).toBe(null);
      fs.writeFileSync(
        keymapPath,
        JSON.stringify({ 'core:star-item': ['s'], 'core:archive-item': ['k'] })
      );
      renderRow(['k'], true);
      ReactTestUtils.Simulate.click(host.querySelector('.reset-shortcut'));
      expect(saved()).toEqual({ 'core:star-item': ['s'] });
    });

    it('hides Reset while a key is being recorded', function () {
      spyOn(AppEnv.keymaps, 'suspendAllKeymaps');
      spyOn(AppEnv.keymaps, 'resumeAllKeymaps');
      renderRow(['k'], true);
      ReactTestUtils.Simulate.click(host.querySelector('.add-shortcut'));
      expect(host.querySelector('.reset-shortcut')).toBe(null);
    });
  });

  describe('the whole page', function () {
    let reloadKeymaps: () => void;
    const config = { get: () => 'Gmail', set: () => {} };
    const sectionCommands = (i: number) => displayedKeybindings[i].items.map(([c]) => c);
    const allCommands = displayedKeybindings.flatMap((s) => s.items.map(([c]) => c));

    beforeEach(function () {
      spyOn(AppEnv.keymaps, 'onDidReloadKeymap').andCallFake((callback) => {
        reloadKeymaps = callback;
        return { dispose: () => {} };
      });
      ReactDOM.render(<PreferencesKeymaps config={config} />, host);
    });

    it("clears one section's commands with that section's Clear, keeping the rest", function () {
      const clearLinks = host.querySelectorAll('.clear-section');
      ReactTestUtils.Simulate.click(clearLinks[0]);
      const expected = { 'core:star-item': ['s'] };
      for (const command of sectionCommands(0)) expected[command] = [];
      expect(sectionCommands(0)).not.toContain('core:star-item');
      expect(saved()).toEqual(expected);
    });

    it('clears every command once Clear All is confirmed', function () {
      const remote = require('@electron/remote');
      spyOn(remote.dialog, 'showMessageBoxSync').andReturn(1);
      ReactTestUtils.Simulate.click(host.querySelector('.container-dropdown .btn'));
      for (const command of allCommands) {
        expect(saved()[command]).toEqual([]);
      }
    });

    it('clears nothing when Clear All is cancelled', function () {
      const remote = require('@electron/remote');
      spyOn(remote.dialog, 'showMessageBoxSync').andReturn(0);
      ReactTestUtils.Simulate.click(host.querySelector('.container-dropdown .btn'));
      expect(saved()).toEqual({ 'core:star-item': ['s'] });
    });

    it('offers Reset on the commands the user keymap sets, as the file changes', function () {
      const resetsFor = () =>
        [...host.querySelectorAll('.shortcut')]
          .filter((row) => row.querySelector('.reset-shortcut'))
          .map((row) => row.querySelector('.shortcut-name').textContent);
      expect(resetsFor()).toEqual(['Star']);
      fs.writeFileSync(keymapPath, JSON.stringify({ 'core:archive-item': [] }));
      reloadKeymaps();
      expect(resetsFor()).toEqual(['Archive']);
    });
  });
});
