import { localized, React, PropTypes } from 'mailspring-exports';

class TemplateStatusBar extends React.Component {
  static displayName = 'TemplateStatusBar';

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
          'Press &quot;tab&quot; to quickly move between the blanks - highlighting will not be visible to recipients.'
        )}
      </div>
    );
  }
}

TemplateStatusBar.containerStyles = {
  textAlign: 'center',
  width: 580,
  margin: 'auto',
};

export default TemplateStatusBar;
