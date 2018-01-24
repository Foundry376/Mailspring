const { Actions, AccountStore, React, PropTypes, WorkspaceStore } = require('mailspring-exports');
const { RetinaImg, KeyCommandsRegion } = require('mailspring-component-kit');

const LabelPickerPopover = require('./label-picker-popover').default;

// This changes the category on one or more threads.
class LabelPicker extends React.Component {
  static displayName = 'LabelPicker';
  static containerRequired = false;
  static propTypes = { items: PropTypes.array };
  static contextTypes = { sheetDepth: PropTypes.number };

  constructor(props) {
    super(props);
    this._account = AccountStore.accountForItems(this.props.items);
  }

  // If the threads we're picking categories for change, (like when they
  // get their categories updated), we expect our parents to pass us new
  // props. We don't listen to the DatabaseStore ourselves.
  componentWillReceiveProps(nextProps) {
    return (this._account = AccountStore.accountForItems(nextProps.items));
  }

  _keymapHandlers() {
    return { 'core:change-labels': this._onOpenCategoryPopover };
  }

  _onOpenCategoryPopover = () => {
    if (!(this.props.items.length > 0)) {
      return;
    }
    if (this.context.sheetDepth !== WorkspaceStore.sheetStack().length - 1) {
      return;
    }
    const buttonRect = this._buttonEl.getBoundingClientRect();
    Actions.openPopover(<LabelPickerPopover threads={this.props.items} account={this._account} />, {
      originRect: buttonRect,
      direction: 'down',
    });
  };

  render() {
    if (!this._account) {
      return <span />;
    }
    if (!this._account.usesLabels()) {
      return <span />;
    }
    const btnClasses = 'btn btn-toolbar btn-category-picker';

    return (
      <KeyCommandsRegion
        style={{ order: -103 }}
        globalHandlers={this._keymapHandlers()}
        globalMenuItems={[
          {
            label: 'Thread',
            submenu: [
              {
                label: 'Apply Labels...',
                command: 'core:change-labels',
                position: 'endof=thread-actions',
              },
            ],
          },
        ]}
      >
        <button
          tabIndex={-1}
          ref={el => (this._buttonEl = el)}
          title={'Apply Labels'}
          onClick={this._onOpenCategoryPopover}
          className={btnClasses}
        >
          <RetinaImg name={'toolbar-tag.png'} mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </KeyCommandsRegion>
    );
  }
}

module.exports = LabelPicker;
