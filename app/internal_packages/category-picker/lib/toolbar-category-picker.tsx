const {
  localized,
  Actions,
  React,
  PropTypes,
  AccountStore,
  WorkspaceStore,
} = require('mailspring-exports');
const { RetinaImg, KeyCommandsRegion } = require('mailspring-component-kit');

const MovePickerPopover = require('./move-picker-popover').default;
const LabelPickerPopover = require('./label-picker-popover').default;

// This sets the folder / label on one or more threads.
class MovePicker extends React.Component {
  static displayName = 'MovePicker';
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
    this._account = AccountStore.accountForItems(nextProps.items);
  }

  _onOpenLabelsPopover = () => {
    if (!(this.props.items.length > 0)) {
      return;
    }
    if (this.context.sheetDepth !== WorkspaceStore.sheetStack().length - 1) {
      return;
    }
    Actions.openPopover(<LabelPickerPopover threads={this.props.items} account={this._account} />, {
      originRect: this._labelEl.getBoundingClientRect(),
      direction: 'down',
    });
  };

  _onOpenMovePopover = () => {
    if (!(this.props.items.length > 0)) {
      return;
    }
    if (this.context.sheetDepth !== WorkspaceStore.sheetStack().length - 1) {
      return;
    }
    Actions.openPopover(<MovePickerPopover threads={this.props.items} account={this._account} />, {
      originRect: this._moveEl.getBoundingClientRect(),
      direction: 'down',
    });
  };

  render() {
    if (!this._account) {
      return <span />;
    }

    const handlers = {
      'core:change-folders': this._onOpenMovePopover,
    };
    if (this._account.usesLabels()) {
      Object.assign(handlers, {
        'core:change-labels': this._onOpenLabelsPopover,
      });
    }

    return (
      <div className="button-group" style={{ order: -103 }}>
        <KeyCommandsRegion globalHandlers={handlers}>
          <button
            tabIndex={-1}
            ref={el => (this._moveEl = el)}
            title={localized('Move to Folder')}
            onClick={this._onOpenMovePopover}
            className={'btn btn-toolbar btn-category-picker'}
          >
            <RetinaImg name={'toolbar-movetofolder.png'} mode={RetinaImg.Mode.ContentIsMask} />
          </button>
          {this._account.usesLabels() && (
            <button
              tabIndex={-1}
              ref={el => (this._labelEl = el)}
              title={localized('Apply Label')}
              onClick={this._onOpenLabelsPopover}
              className={'btn btn-toolbar btn-category-picker'}
            >
              <RetinaImg name={'toolbar-tag.png'} mode={RetinaImg.Mode.ContentIsMask} />
            </button>
          )}
        </KeyCommandsRegion>
      </div>
    );
  }
}

module.exports = MovePicker;
