import React from 'react';
import ReactDOM from 'react-dom';
import { Value } from 'slate';
import { cleanupDraft } from '../../../src/components/composer-editor/grammar-check-plugins';
import { ComposerEditor } from '../../../src/components/composer-editor/composer-editor';
import { activate, deactivate } from '../../../internal_packages/composer-grammar-check/lib/main';
import { HarperDictionary } from '../../../src/harper-dictionary';
import TimeOverride from '../../spec-runner/time-override';

describe('Harper editor decorations', () => {
  let container: HTMLDivElement;
  const plugin = {};
  const draftId = 'harper-editor-spec';

  beforeEach(() => {
    TimeOverride.disableSpies();
    AppEnv.config.set('core.composing.grammarCheck', true);
    AppEnv.config.set('core.composing.grammarCheckDisabledRules', '');
    AppEnv.config.set(HarperDictionary.configKey, []);
    activate.call(plugin);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    cleanupDraft(draftId);
    deactivate.call(plugin);
  });

  it('renders Harper underlines and updates them when words are learned and removed', () => {
    waitsForPromise({ timeout: 20000 }, async () => {
      let editor: any;
      class Harness extends React.Component {
        state = {
          value: Value.fromJSON({
            document: {
              nodes: [
                {
                  object: 'block',
                  type: 'div',
                  nodes: [
                    {
                      object: 'text',
                      leaves: [
                        {
                          object: 'leaf',
                          text: 'This is a example. I recieved your speling message.',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        };
        render() {
          return (
            <ComposerEditor
              onUpdatedSlateEditor={(ref) => (editor = ref)}
              value={this.state.value}
              propsForPlugins={{ draft: { headerMessageId: draftId } }}
              onChange={({ value }) => this.setState({ value })}
            />
          );
        }
      }
      ReactDOM.render(<Harness />, container);
      const waitFor = async (condition: () => boolean) => {
        const deadline = Date.now() + 10000;
        while (!condition() && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 50));
        expect(condition()).toBe(true);
      };
      const markedWords = () =>
        Array.from(container.querySelectorAll('[data-grammar-error]')).map((el) => el.textContent);
      await waitFor(() => markedWords().includes('recieved'));
      expect(markedWords()).toContain('a');
      editor.moveToStartOfDocument().moveForward(23).focus();
      const learnButton = () =>
        Array.from(container.querySelectorAll('.grammar-actions button')).find(
          (button) => button.textContent === 'Learn Spelling'
        ) as HTMLButtonElement;
      await waitFor(() => !!learnButton());
      learnButton().click();
      expect(HarperDictionary.words()).toContain('recieved');
      await waitFor(() => !markedWords().includes('recieved'));
      expect(markedWords()).toContain('speling');
      AppEnv.config.set(HarperDictionary.configKey, []);
      await waitFor(() => markedWords().includes('recieved'));
      expect(container.querySelector('[contenteditable="true"]').getAttribute('spellcheck')).toBe(
        'false'
      );
      // The final edit happens inside the old 300ms throttle window.
      editor.moveToEndOfDocument().insertText(' ');
      await new Promise((resolve) => setTimeout(resolve, 50));
      editor.insertText('Anothr');
      await waitFor(() => markedWords().includes('Anothr'));
      // A same-length edit must update the word stored in the decoration too.
      editor.deleteBackward(6).insertText('Anothx');
      await waitFor(() =>
        editor.value
          .get('decorations')
          .some((decoration) => decoration.mark.data.get('word') === 'Anothx')
      );
    });
  });
});
