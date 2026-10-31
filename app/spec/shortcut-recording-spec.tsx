import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import CommandItem from '../internal_packages/preferences/lib/tabs/keymaps/command-item';
import {
  bindingFromKeys,
  withBinding,
  readUserKeymap,
} from '../internal_packages/preferences/lib/tabs/keymaps/user-keymap';

const KEY_CODES = { e: 69, g: 71, i: 73, k: 75, esc: 27, ctrl: 17 };

describe('bindingFromKeys', function () {
  it('joins plain keys pressed in turn as a sequence', function () {
    expect(bindingFromKeys(['g', 'i'], [], 'linux')).toBe('g i');
  });

  it('joins modifiers to the key, writing the command key as mod', function () {
    expect(bindingFromKeys(['k'], ['shift', 'ctrl'], 'linux')).toBe('shift+mod+k');
    expect(bindingFromKeys(['k'], ['meta'], 'darwin')).toBe('mod+k');
  });
});

describe('withBinding', function () {
  it('adds the binding after the keys the command already has', function () {
    expect(withBinding(['e'], 'k')).toEqual(['e', 'k']);
  });

  it('does not add a key the command already has', function () {
    expect(withBinding(['e', 'k'], 'k')).toEqual(['e', 'k']);
  });
});

describe('readUserKeymap', function () {
  it('reads a missing or unreadable keymap as empty', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-read-'));
    spyOn(console, 'error');
    expect(readUserKeymap(path.join(dir, 'missing.json'))).toEqual({});
    expect(console.error).not.toHaveBeenCalled();
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    expect(readUserKeymap(path.join(dir, 'broken.json'))).toEqual({});
    expect(console.error).toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Recording a shortcut on the Shortcuts page', function () {
  let host: HTMLDivElement;
  let dir: string;
  let keymapPath: string;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-record-'));
    keymapPath = path.join(dir, 'keymap.json');
    fs.writeFileSync(keymapPath, JSON.stringify({ 'core:star-item': ['s'] }));
    spyOn(AppEnv.keymaps, 'getUserKeymapPath').andReturn(keymapPath);
    spyOn(AppEnv.keymaps, 'suspendAllKeymaps');
    spyOn(AppEnv.keymaps, 'resumeAllKeymaps');
    host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(
      <CommandItem command="core:archive-item" label="Archive" bindings={['e']} />,
      host
    );
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const addButton = () => host.querySelector('.add-shortcut') as HTMLButtonElement;
  const recorder = () => host.querySelector('.shortcut-recorder') as HTMLElement;
  const press = (
    key: keyof typeof KEY_CODES,
    mods: { ctrlKey?: boolean; preventDefault?: () => void } = {}
  ) =>
    ReactTestUtils.Simulate.keyDown(recorder(), {
      key,
      keyCode: KEY_CODES[key],
      which: KEY_CODES[key],
      ...mods,
    });
  const saved = () => JSON.parse(fs.readFileSync(keymapPath).toString());
  const startRecording = () => ReactTestUtils.Simulate.click(addButton());

  it('records only after + is clicked, with every other shortcut suspended', function () {
    expect(recorder()).toBe(null);
    startRecording();
    expect(document.activeElement).toBe(recorder());
    expect(recorder().textContent).toBe('Press a shortcut, Esc to cancel');
    expect(AppEnv.keymaps.suspendAllKeymaps).toHaveBeenCalled();
  });

  it('adds a single plain key once the sequence timeout passes, keeping the existing keys', function () {
    startRecording();
    press('k');
    expect(saved()['core:archive-item']).toBe(undefined);
    advanceClock(1000);
    expect(saved()).toEqual({ 'core:star-item': ['s'], 'core:archive-item': ['e', 'k'] });
    expect(AppEnv.keymaps.resumeAllKeymaps).toHaveBeenCalled();
    expect(document.activeElement).toBe(addButton());
  });

  it('records two plain keys as a sequence, without a second save when the timeout passes', function () {
    startRecording();
    press('g');
    press('i');
    expect(saved()['core:archive-item']).toEqual(['e', 'g i']);
    fs.writeFileSync(keymapPath, '{}');
    advanceClock(1000);
    expect(saved()).toEqual({});
  });

  it('records a key with a modifier at once', function () {
    startRecording();
    press('ctrl', { ctrlKey: true });
    press('k', { ctrlKey: true });
    expect(saved()['core:archive-item']).toEqual(['e', 'mod+k']);
  });

  it('records nothing when Esc is pressed', function () {
    startRecording();
    press('esc');
    advanceClock(1000);
    expect(saved()['core:archive-item']).toBe(undefined);
    expect(recorder()).toBe(null);
    expect(AppEnv.keymaps.resumeAllKeymaps).toHaveBeenCalled();
    expect(document.activeElement).toBe(addButton());
  });

  it('keeps a recorded key from doing anything else, such as Tab moving focus', function () {
    startRecording();
    const preventDefault = jasmine.createSpy('preventDefault');
    press('k', { preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('records nothing when focus leaves the recorder, and leaves focus where it went', function () {
    const elsewhere = document.createElement('input');
    host.appendChild(elsewhere);
    startRecording();
    press('k');
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);
    advanceClock(1000);
    expect(saved()['core:archive-item']).toBe(undefined);
    expect(recorder()).toBe(null);
    expect(AppEnv.keymaps.resumeAllKeymaps).toHaveBeenCalled();
  });

  it('gives the keyboard back if the page closes mid-recording', function () {
    startRecording();
    press('k');
    ReactDOM.unmountComponentAtNode(host);
    advanceClock(1000);
    expect(AppEnv.keymaps.resumeAllKeymaps).toHaveBeenCalled();
    expect(saved()['core:archive-item']).toBe(undefined);
  });
});
