import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import HarperDictionarySection from '../lib/tabs/harper-dictionary-section';
import { HarperDictionary } from 'mailspring-exports';

describe('Harper learned word preferences', () => {
  let container: HTMLDivElement;
  let words: string[];
  let config: any;

  beforeEach(() => {
    words = ['recieved', 'speling'];
    config = {
      get: () => words,
      set: (_key, value) => (words = value),
    };
    container = document.createElement('div');
    ReactDOM.render(<HarperDictionarySection config={config} />, container);
  });

  afterEach(() => ReactDOM.unmountComponentAtNode(container));

  const edit = (text: string) => {
    const textarea = container.querySelector('textarea');
    textarea.value = text;
    ReactTestUtils.Simulate.change(textarea);
  };

  it('edits and removes words, trims lines, and removes duplicates on save', () => {
    expect(container.querySelector('textarea').value).toBe('recieved\nspeling');
    edit('  received\n\nreceived\nHarper  ');
    ReactTestUtils.Simulate.click(container.querySelector('button'));
    expect(words).toEqual(['received', 'Harper']);
    expect(container.querySelector('[role="status"]').textContent).toBe('Saved');
    edit('');
    ReactTestUtils.Simulate.click(container.querySelector('button'));
    expect(words).toEqual([]);
  });

  it('cancels without changing saved words and preserves words learned while editing', () => {
    edit('replacement');
    ReactTestUtils.Simulate.click(container.querySelectorAll('button')[1]);
    expect(words).toEqual(['recieved', 'speling']);
    expect(container.querySelector('textarea').value).toBe('recieved\nspeling');
    edit('replacement');
    words.push('Anothr');
    ReactTestUtils.Simulate.click(container.querySelector('button'));
    expect(words).toEqual(['replacement', 'Anothr']);
  });

  it('keeps unsaved edits when saving fails', () => {
    edit('replacement');
    config.set = () => {
      throw new Error('Write failed');
    };
    ReactTestUtils.Simulate.click(container.querySelector('button'));
    expect(container.querySelector('textarea').value).toBe('replacement');
    expect(container.querySelector('[role="status"]').textContent).toContain('Could not save');
    expect(HarperDictionary.normalize([' x ', 'x', '', null])).toEqual(['x']);
  });
});
