import React, { useRef } from 'react';
import {
  localized,
  Actions,
  Message,
  DraftEditingSession,
  FeatureUsageStore,
} from 'mailspring-exports';

import { Menu, RetinaImg } from 'mailspring-component-kit';
import { TranslatePopupOptions, translateMessageBody, TranslationsUsedLexicon } from './service';

type Props = { draft: Message; session: DraftEditingSession };

const TranslateComposerButtonInner: React.FC<Props> = ({ draft, session }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onTranslate = async (langName: string) => {
    Actions.closePopover();

    try {
      await FeatureUsageStore.markUsedOrUpgrade('translation', TranslationsUsedLexicon);
    } catch (err) {
      // user does not have access to this feature
      return;
    }

    const langCode = TranslatePopupOptions[langName];
    const translated = await translateMessageBody(draft.body, langCode);

    session.changes.add({ body: translated });
    session.changes.commit();
  };

  const onClickTranslateButton = () => {
    if (!buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    Actions.openPopover(
      <Menu
        className="translate-language-picker"
        items={Object.keys(TranslatePopupOptions)}
        itemKey={(item) => item}
        itemContent={(item) => item}
        headerComponents={[<span key="header">{localized('Translate')}:</span>]}
        defaultSelectedIndex={-1}
        onSelect={onTranslate}
      />,
      { originRect: buttonRect, direction: 'up' }
    );
  };

  if (draft.plaintext) {
    return <span />;
  }
  return (
    <button
      ref={buttonRef}
      tabIndex={-1}
      className="btn btn-toolbar btn-translate pull-right"
      onClick={onClickTranslateButton}
      title={localized('Translate email body…')}
    >
      <RetinaImg
        mode={RetinaImg.Mode.ContentIsMask}
        url="mailspring://translation/assets/icon-composer-translate@2x.png"
      />
      &nbsp;
      <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
    </button>
  );
};
// Our render method doesn't use the provided `draft`, and the draft changes
// constantly (on every keystroke!). Memoizing on `session` keeps Mailspring fast.
export const TranslateComposerButton = React.memo(
  TranslateComposerButtonInner,
  (prev, next) => prev.session === next.session
);
TranslateComposerButton.displayName = 'TranslateComposerButton';
