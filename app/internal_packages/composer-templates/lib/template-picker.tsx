/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React from 'react';
import ReactDOM from 'react-dom';
import { localized, PropTypes, Actions } from 'mailspring-exports';
import { Menu, RetinaImg } from 'mailspring-component-kit';
import TemplateStore from './template-store';

class TemplatePopover extends React.Component<{ headerMessageId: string }> {
  static displayName = 'TemplatePopover';

  static propTypes = {
    headerMessageId: PropTypes.string,
  };

  unsubscribe?: () => void;

  state = {
    searchValue: '',
    templates: TemplateStore.items(),
  };

  componentDidMount() {
    this.unsubscribe = TemplateStore.listen(() => {
      this.setState({ templates: TemplateStore.items() });
    });
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _filteredTemplates() {
    const { searchValue, templates } = this.state;

    if (!searchValue.length) {
      return templates;
    }

    return templates.filter(t => {
      return t.name.toLowerCase().indexOf(searchValue.toLowerCase()) === 0;
    });
  }

  _onSearchValueChange = event => {
    this.setState({ searchValue: event.target.value });
  };

  _onChooseTemplate = template => {
    Actions.insertTemplateId({
      templateId: template.id,
      headerMessageId: this.props.headerMessageId,
    });
    Actions.closePopover();
  };

  _onManageTemplates = () => {
    Actions.showTemplates();
  };

  _onNewTemplate = () => {
    Actions.createTemplate({ headerMessageId: this.props.headerMessageId });
  };

  render() {
    const filteredTemplates = this._filteredTemplates();

    const headerComponents = [
      <input
        type="text"
        tabIndex={1}
        key="textfield"
        className="search"
        value={this.state.searchValue}
        onChange={this._onSearchValueChange}
      />,
    ];

    // note: these are using onMouseDown to avoid clearing focus in the composer (I think)
    const footerComponents = [
      <div className="item" key="new" onMouseDown={this._onNewTemplate}>
        {localized('Save Draft as Template...')}
      </div>,
      <div className="item" key="manage" onMouseDown={this._onManageTemplates}>
        {localized('Manage Templates...')}
      </div>,
    ];

    return (
      <Menu
        className="template-picker"
        headerComponents={headerComponents}
        footerComponents={footerComponents}
        items={filteredTemplates}
        itemKey={item => item.id}
        itemContent={item => item.name}
        onSelect={this._onChooseTemplate}
      />
    );
  }
}

class TemplatePicker extends React.Component<{ headerMessageId: string }> {
  static displayName = 'TemplatePicker';

  static propTypes = {
    headerMessageId: PropTypes.string,
  };

  _onClickButton = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(<TemplatePopover headerMessageId={this.props.headerMessageId} />, {
      originRect: buttonRect,
      direction: 'up',
    });
  };

  render() {
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar btn-templates narrow pull-right"
        onClick={this._onClickButton}
        title={localized('Quick Reply')}
      >
        <RetinaImg
          url="mailspring://composer-templates/assets/icon-composer-templates@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
        />
        &nbsp;
        <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

export default TemplatePicker;
