import React from 'react';
import { localized, PropTypes, Message, DraftEditingSession } from 'mailspring-exports';
import { GrammarCheckStore } from './grammar-check-store';

export class GrammarCheckUsageBanner extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  static displayName = 'GrammarCheckUsageBanner';

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

  render() {
    if (!GrammarCheckStore.isUsageExceeded()) return null;

    return (
      <div className="grammar-usage-banner">
        <span>
          {localized('Grammar check is disabled — usage limit reached for this billing period.')}
        </span>
      </div>
    );
  }
}
