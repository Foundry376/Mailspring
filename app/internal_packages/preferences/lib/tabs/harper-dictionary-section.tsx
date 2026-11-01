import React from 'react';
import { HarperDictionary, localized } from 'mailspring-exports';
import { ConfigLike } from '../types';

export default class HarperDictionarySection extends React.Component<
  { config: ConfigLike },
  { draft: string | null; original: string[]; status: string }
> {
  state = { draft: null as string | null, original: [] as string[], status: '' };

  _onSave = () => {
    const words = HarperDictionary.normalize(this.state.draft.split(/\r?\n/));
    // Keep words learned in another composer while this list was being edited.
    const additions = HarperDictionary.words(this.props.config).filter(
      (word) => !this.state.original.includes(word)
    );
    try {
      this.props.config.set(
        HarperDictionary.configKey,
        HarperDictionary.normalize([...words, ...additions])
      );
      this.setState({ draft: null, status: localized('Saved') });
    } catch (error) {
      this.setState({ status: localized('Could not save learned words. Please try again.') });
    }
  };

  render() {
    const words = HarperDictionary.words(this.props.config);
    return (
      <div className="harper-dictionary item">
        <label htmlFor="harper-learned-words">{localized('Harper learned words')}</label>
        <p id="harper-learned-words-help">
          {localized('One word per line. Edit or remove words to change what Harper accepts.')}
        </p>
        <textarea
          id="harper-learned-words"
          aria-describedby="harper-learned-words-help"
          rows={5}
          spellCheck={false}
          placeholder={localized('No learned words yet')}
          value={this.state.draft ?? words.join('\n')}
          onChange={(event) =>
            this.setState({
              draft: event.target.value,
              original: this.state.draft === null ? words : this.state.original,
              status: '',
            })
          }
        />
        <div className="harper-dictionary-actions">
          <button
            type="button"
            className="btn btn-small"
            disabled={this.state.draft === null}
            onClick={this._onSave}
          >
            {localized('Save words')}
          </button>
          {this.state.draft !== null && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => this.setState({ draft: null, status: '' })}
            >
              {localized('Cancel')}
            </button>
          )}
          <span role="status">{this.state.status}</span>
        </div>
      </div>
    );
  }
}
