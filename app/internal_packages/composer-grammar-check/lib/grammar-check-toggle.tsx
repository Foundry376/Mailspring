import React from 'react';
import {
  PropTypes,
  localized,
  Message,
  DraftEditingSession,
  GrammarCheckPluginAPI,
  FeatureUsageStore,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import {
  GrammarCheckStore,
  GRAMMAR_CHECK_FEATURE_ID,
  GRAMMAR_CHECK_UPGRADE_LEXICON,
} from './grammar-check-store';

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
  private _featureUnsub?: () => void;

  componentDidMount() {
    this._unsub = GrammarCheckStore.listen(() => this.forceUpdate());
    this._featureUnsub = FeatureUsageStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    if (this._unsub) this._unsub();
    if (this._featureUnsub) this._featureUnsub();
  }

  _onClick = async () => {
    const current = !!AppEnv.config.get('core.composing.grammarCheck');
    const next = !current;

    if (FeatureUsageStore.isUsable(GRAMMAR_CHECK_FEATURE_ID)) {
      AppEnv.config.set('core.composing.grammarCheck', next);
      if (next) {
        GrammarCheckPluginAPI.requestInitialCheckForDraft(this.props.draft.headerMessageId);
      }
    } else {
      AppEnv.config.set('core.composing.grammarCheck', false);
      try {
        await FeatureUsageStore.displayUpgradeModal(
          GRAMMAR_CHECK_FEATURE_ID,
          GRAMMAR_CHECK_UPGRADE_LEXICON
        );
      } catch (err) {
        // User dismissed without upgrading — leave the feature disabled
        return;
      }
    }
  };

  render() {
    const enabled = GrammarCheckStore.isEnabled();
    // Combine the proactive quota check (FeatureUsageStore) with the reactive
    // API-detected exceeded state (GrammarCheckStore) so either source shows the warning.
    const usedUp = !FeatureUsageStore.isUsable(GRAMMAR_CHECK_FEATURE_ID);
    const checking = GrammarCheckStore.isChecking(this.props.draft.headerMessageId);
    const errorCount = GrammarCheckStore.errorCount(this.props.draft.headerMessageId);

    // Matches MetadataComposerToggleButton: show warning overlay when the feature
    // is switched on but the quota is exhausted.
    const onByDefaultButUsedUp = enabled && usedUp;

    let title: string;
    let className = 'btn btn-toolbar btn-grammar-check';

    if (enabled && !usedUp) {
      className += ' btn-enabled';
    }
    if (checking) {
      className += ' checking';
    }

    if (onByDefaultButUsedUp) {
      title = localized('Grammar check: usage limit reached');
    } else if (enabled) {
      title =
        errorCount > 0
          ? localized(`Grammar check: %@ issue(s)`, errorCount)
          : localized('Grammar check: no issues');
    } else {
      title = localized('Enable grammar check');
    }

    return (
      <button tabIndex={-1} className={className} onClick={this._onClick} title={title}>
        {onByDefaultButUsedUp && (
          <div style={{ position: 'absolute', zIndex: 2, transform: 'translate(14px, -4px)' }}>
            <RetinaImg name="tiny-warning-sign.png" mode={RetinaImg.Mode.ContentPreserve} />
          </div>
        )}
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
