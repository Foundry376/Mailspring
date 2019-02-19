import React from 'react';
import PropTypes from 'prop-types';
import { Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import Fields from './fields';

export default class ComposerHeaderActions extends React.Component {
  static displayName = 'ComposerHeaderActions';

  static propTypes = {
    headerMessageId: PropTypes.string.isRequired,
    enabledFields: PropTypes.array.isRequired,
    onShowAndFocusField: PropTypes.func.isRequired,
  };

  _onPopoutComposer = () => {
    Actions.composePopoutDraft(this.props.headerMessageId);
  };

  render() {
    const items = [];

    if (!this.props.enabledFields.includes(Fields.Cc)) {
      items.push(
        <span
          className="action show-cc"
          key="cc"
          onClick={() => this.props.onShowAndFocusField(Fields.Cc)}
        >
          CC
        </span>
      );
    }

    if (!this.props.enabledFields.includes(Fields.Bcc)) {
      items.push(
        <span
          className="action show-bcc"
          key="bcc"
          onClick={() => this.props.onShowAndFocusField(Fields.Bcc)}
        >
          BCC
        </span>
      );
    }

    if (!this.props.enabledFields.includes(Fields.Subject)) {
      items.push(
        <span
          className="action show-subject"
          key="subject"
          onClick={() => this.props.onShowAndFocusField(Fields.Subject)}
        >
          SUBJECT
        </span>
      );
    }

    if (!AppEnv.isComposerWindow()) {
      items.push(
        <span
          className="action show-popout"
          key="popout"
          title="Popout composer…"
          onClick={this._onPopoutComposer}
        >
          <RetinaImg
            name="popout.svg"
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ position: 'relative', top: '-2px', width: 20 }}
          />
        </span>
      );
    }

    return <div className="composer-header-actions">{items}</div>;
  }
}
