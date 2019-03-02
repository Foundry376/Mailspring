import React from 'react';
import PropTypes from 'prop-types';
import { localized, Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
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

  render() {
    const items = [];

    if (!this.props.enabledFields.includes(Fields.Cc)) {
      items.push(
        <span
          className="action show-cc"
          key="cc"
          onClick={() => this.props.onShowAndFocusField(Fields.Cc)}
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
          onClick={() => this.props.onShowAndFocusField(Fields.Bcc)}
        >
          {localized('Bcc')}
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
          {localized('Subject')}
        </span>
      );
    }

    if (!AppEnv.isComposerWindow()) {
      items.push(
        <span
          className="action show-popout"
          key="popout"
          title={localized('Popout composer…')}
          onClick={this._onPopoutComposer}
        >
          <RetinaImg
            name="composer-popout.png"
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ position: 'relative', top: '-2px' }}
          />
        </span>
      );
    }

    return <div className="composer-header-actions">{items}</div>;
  }
}
