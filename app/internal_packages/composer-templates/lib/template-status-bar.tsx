import React from 'react';
import { localized, PropTypes, Message } from 'mailspring-exports';

class TemplateStatusBar extends React.Component<{ draft: Message }> {
  static displayName = 'TemplateStatusBar';

  static containerStyles = {
    textAlign: 'center',
    width: 580,
    margin: 'auto',
  };

  static propTypes = {
    draft: PropTypes.object.isRequired,
  };

  _usingTemplate({ draft }) {
    return (
      draft &&
      draft.bodyEditorState &&
      draft.bodyEditorState.document.getInlinesByType('templatevar').size > 0
    );
  }

  render() {
    if (!this._usingTemplate(this.props)) {
      return <div />;
    }
    return (
      <div className="template-status-bar">
        {localized(
          'Press "tab" to quickly move between the blanks - highlighting will not be visible to recipients.'
        )}
      </div>
    );
  }
}

export default TemplateStatusBar;
