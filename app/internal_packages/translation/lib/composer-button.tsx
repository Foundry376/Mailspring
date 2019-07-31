import React from 'react';
import ReactDOM from 'react-dom';
import {
  PropTypes,
  localized,
  Actions,
  Message,
  DraftEditingSession,
  FeatureUsageStore,
} from 'mailspring-exports';

import { Menu, RetinaImg } from 'mailspring-component-kit';
import { TranslatePopupOptions, translateMessageBody, TranslationsUsedLexicon } from './service';

export class TranslateComposerButton extends React.Component<{
  draft: Message;
  session: DraftEditingSession;
}> {
  // Adding a `displayName` makes debugging React easier
  static displayName = 'TranslateComposerButton';

  // Since our button is being injected into the Composer Footer,
  // we receive the local id of the current draft as a `prop` (a read-only
  // property). Since our code depends on this prop, we mark it as a requirement.
  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  shouldComponentUpdate(nextProps) {
    // Our render method doesn't use the provided `draft`, and the draft changes
    // constantly (on every keystroke!) `shouldComponentUpdate` helps keep Mailspring fast.
    return nextProps.session !== this.props.session;
  }

  _onTranslate = async langName => {
    Actions.closePopover();

    try {
      await FeatureUsageStore.markUsedOrUpgrade('translation', TranslationsUsedLexicon);
    } catch (err) {
      // user does not have access to this feature
      return;
    }

    // Obtain the session for the current draft. The draft session provides us
    // the draft object and also manages saving changes to the local cache and
    // Nilas API as multiple parts of the application touch the draft.
    const langCode = TranslatePopupOptions[langName];
    const translated = await translateMessageBody(this.props.draft.body, langCode);

    // To update the draft, we add the new body to it's session. The session object
    // automatically marshalls changes to the database and ensures that others accessing
    // the same draft are notified of changes.
    this.props.session.changes.add({ body: translated });
    this.props.session.changes.commit();
  };

  _onClickTranslateButton = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(this._renderPopover(), { originRect: buttonRect, direction: 'up' });
  };

  // Helper method that will render the contents of our popover.
  _renderPopover() {
    const headerComponents = [<span key="header">{localized('Translate')}:</span>];
    return (
      <Menu
        className="translate-language-picker"
        items={Object.keys(TranslatePopupOptions)}
        itemKey={item => item}
        itemContent={item => item}
        headerComponents={headerComponents}
        defaultSelectedIndex={-1}
        onSelect={this._onTranslate}
      />
    );
  }

  // The `render` method returns a React Virtual DOM element. This code looks
  // like HTML, but don't be fooled. The JSX preprocessor converts
  // `<a href="http://facebook.github.io/react/">Hello!</a>`
  // into Javascript objects which describe the HTML you want:
  // `React.createElement('a', {href: 'http://facebook.github.io/react/'}, 'Hello!')`

  // We're rendering a `Menu` inside our Popover, and using a `RetinaImg` for the button.
  // These components are part of N1's standard `mailspring-component-kit` library,
  // and make it easy to build interfaces that match the rest of N1's UI.
  //
  // For example, using the `RetinaImg` component makes it easy to display an
  // image from our package. `RetinaImg` will automatically chose the best image
  // format for our display.
  render() {
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar btn-translate pull-right"
        onClick={this._onClickTranslateButton}
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
  }
}
