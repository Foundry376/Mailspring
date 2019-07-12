import React from 'react';
import ToolbarEmojiButton from './emoji-plugins';
import { BuildMarkButtonWithValuePicker} from './toolbar-component-factories';
import { LINK_TYPE } from './link-plugins';

export default class MoreComposerButtonsPopover extends React.Component {
  static displayName = 'MoreComposerButtonsPopover';

  constructor(props) {
    super(props);
  }
  renderEmojiButton() {
    const EmojiButton = ToolbarEmojiButton[0].toolbarComponents[0];
    return <EmojiButton {...this.props} />;
  }
  renderLinkButton() {
    const LinkButton = BuildMarkButtonWithValuePicker({
      type: LINK_TYPE,
      field: 'href',
      iconClassOn: 'dt-icon dt-icon-link',
      iconClassOff: 'dt-icon dt-icon-link',
      placeholder: 'http://',
    }, {alwaysShow: true, anchorEl: this.props.anchorEl})
    return <LinkButton {...this.props} />;
  }

  renderOptions() {
    const { value, onChange, readOnly } = this.props;
    const sectionItems = [];

    this.props.buttons.forEach(({ toolbarComponents, toolbarSectionClass }, idx) => {
      sectionItems.push(
        ...toolbarComponents.map((Component, cdx) => (
          <Component
            key={`${idx}-${cdx}`}
            value={value}
            onChange={onChange}
            className={toolbarSectionClass}
            disabled={readOnly}
          />
        ))
      );
    });
    return sectionItems;
  }

  render() {
    return (
      <div className="more-compose-button-popover RichEditor-toolbar floating-container" tabIndex="-1">
        {this.renderEmojiButton()}
        {this.renderLinkButton()}
        {this.renderOptions()}
      </div>
    );
  }
}
