import React from 'react';
import { PropTypes, localized, Message, DraftEditingSession } from 'mailspring-exports';
import { GrammarCheckStore } from './grammar-check-store';

export class GrammarCheckToggle extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  static displayName = 'GrammarCheckToggle';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  private _unsub?: () => void;

  componentDidMount() {
    this._unsub = GrammarCheckStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    if (this._unsub) {
      this._unsub();
    }
  }

  shouldComponentUpdate(nextProps: { draft: Message; session: DraftEditingSession }) {
    return nextProps.draft.headerMessageId !== this.props.draft.headerMessageId;
  }

  _onClick = () => {
    const current = !!AppEnv.config.get('core.composing.grammarCheck');
    AppEnv.config.set('core.composing.grammarCheck', !current);
  };

  render() {
    const enabled = GrammarCheckStore.isEnabled();
    const usageExceeded = GrammarCheckStore.isUsageExceeded();
    const checking = GrammarCheckStore.isChecking(this.props.draft.headerMessageId);
    const errorCount = GrammarCheckStore.errorCount(this.props.draft.headerMessageId);

    let title: string;
    let className = 'btn btn-toolbar btn-grammar-check';

    if (usageExceeded) {
      title = localized('Grammar check: usage limit reached');
      className += ' usage-exceeded';
    } else if (enabled) {
      className += ' enabled';
      title =
        errorCount > 0
          ? localized(`Grammar check: %@ issues`, errorCount)
          : localized('Grammar check: no issues');
    } else {
      title = localized('Enable grammar check');
    }

    return (
      <button tabIndex={-1} className={className} onClick={this._onClick} title={title}>
        <i className={`fa ${usageExceeded ? 'fa-exclamation-circle' : 'fa-check-circle'}`} />
        {checking && <span className="grammar-check-spinner" />}
        {enabled && !usageExceeded && errorCount > 0 && (
          <span className="grammar-error-count">{errorCount}</span>
        )}
      </button>
    );
  }
}
