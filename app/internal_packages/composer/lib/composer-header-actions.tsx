import React from 'react';
import PropTypes from 'prop-types';
import { localized, Actions } from 'mailspring-exports';
import { RetinaImg, RovingTabIndexToolbar } from 'mailspring-component-kit';
import Fields from './fields';

interface ComposerHeaderActionsProps {
  headerMessageId: string;
  enabledFields: string[];
  onShowAndFocusField: (f: string) => void;
}
export default class ComposerHeaderActions extends React.Component<ComposerHeaderActionsProps> {
  static displayName = 'ComposerHeaderActions';

  static propTypes = {
    headerMessageId: PropTypes.string.isRequired,
    enabledFields: PropTypes.array.isRequired,
    onShowAndFocusField: PropTypes.func.isRequired,
  };

  _onPopoutComposer = () => {
    Actions.composePopoutDraft(this.props.headerMessageId);
  };

  _onKeyDown = (handler: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };

  render() {
    const items = [];

    if (!this.props.enabledFields.includes(Fields.Cc)) {
      items.push(
        <span
          className="action show-cc"
          key="cc"
          role="button"
          tabIndex={-1}
          onClick={() => this.props.onShowAndFocusField(Fields.Cc)}
          onKeyDown={this._onKeyDown(() => this.props.onShowAndFocusField(Fields.Cc))}
        >
          {localized('Cc')}
        </span>
      );
    }

    if (!this.props.enabledFields.includes(Fields.Bcc)) {
      items.push(
        <span
          className="action show-bcc"
          key="bcc"
          role="button"
          tabIndex={-1}
          onClick={() => this.props.onShowAndFocusField(Fields.Bcc)}
          onKeyDown={this._onKeyDown(() => this.props.onShowAndFocusField(Fields.Bcc))}
        >
          {localized('Bcc')}
        </span>
      );
    }

    if (!this.props.enabledFields.includes(Fields.ReplyTo)) {
      items.push(
        <span
          className="action show-reply-to"
          key="replyTo"
          role="button"
          tabIndex={-1}
          onClick={() => this.props.onShowAndFocusField(Fields.ReplyTo)}
          onKeyDown={this._onKeyDown(() => this.props.onShowAndFocusField(Fields.ReplyTo))}
        >
          {localized('Reply-To')}
        </span>
      );
    }

    if (!this.props.enabledFields.includes(Fields.Subject)) {
      items.push(
        <span
          className="action show-subject"
          key="subject"
          role="button"
          tabIndex={-1}
          onClick={() => this.props.onShowAndFocusField(Fields.Subject)}
          onKeyDown={this._onKeyDown(() => this.props.onShowAndFocusField(Fields.Subject))}
        >
          {localized('Subject')}
        </span>
      );
    }

    if (!AppEnv.isComposerWindow()) {
      items.push(
        <span
          className="action show-popout"
          key="popout"
          role="button"
          tabIndex={-1}
          title={localized('Popout composer…')}
          aria-label={localized('Popout composer…')}
          onClick={this._onPopoutComposer}
          onKeyDown={this._onKeyDown(this._onPopoutComposer)}
        >
          <RetinaImg
            name="composer-popout.png"
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ position: 'relative', top: '-2px' }}
            aria-hidden="true"
          />
        </span>
      );
    }

    return (
      <RovingTabIndexToolbar
        label={localized('Composer header actions')}
        className="composer-header-actions"
      >
        {items}
      </RovingTabIndexToolbar>
    );
  }
}
