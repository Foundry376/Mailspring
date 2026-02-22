import React from 'react';
import { PropTypes, localized, Message, DraftEditingSession } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { GrammarCheckStore } from './grammar-check-store';
import { requestInitialCheckForDraft } from '../../../src/components/composer-editor/grammar-check-plugins';

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
    if (GrammarCheckStore.isUsageExceeded()) {
      GrammarCheckStore.showUsageExceededModal();
      return;
    }
    const current = !!AppEnv.config.get('core.composing.grammarCheck');
    AppEnv.config.set('core.composing.grammarCheck', !current);
    if (!current) {
      // Grammar check was just enabled — check existing content immediately
      // rather than waiting for the next keystroke to trigger onChange.
      requestInitialCheckForDraft(this.props.draft.headerMessageId);
    }
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
          ? localized(`Grammar check: %@ issue(s)`, errorCount)
          : localized('Grammar check: no issues');
    } else {
      title = localized('Enable grammar check');
    }

    return (
      <button tabIndex={-1} className={className} onClick={this._onClick} title={title}>
        <span className="grammar-check-icon-wrap">
          <RetinaImg
            url="mailspring://composer-grammar-check/assets/icon-composer-grammar@2x.png"
            mode={RetinaImg.Mode.ContentIsMask}
          />
          {checking && <span className="grammar-check-spinner" />}
        </span>
      </button>
    );
  }
}
