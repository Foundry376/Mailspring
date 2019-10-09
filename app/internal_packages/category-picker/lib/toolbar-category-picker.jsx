import CreateNewFolderPopover from './create-new-folder-popover';
import CreateNewLabelPopover from './create-new-label-popover';

const { Actions, React, PropTypes, AccountStore, WorkspaceStore, Folder, CategoryStore } = require('mailspring-exports');

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
    this.state = {
      createFolderPopoverVisible: false,
      moveFolderPopoutVisible: false,
      isFolder: CategoryStore.getInboxCategory(this._account) instanceof Folder
    };
  }

  // If the threads we're picking categories for change, (like when they
  // get their categories updated), we expect our parents to pass us new
  // props. We don't listen to the DatabaseStore ourselves.
  UNSAFE_componentWillReceiveProps(nextProps) {
    this._account = AccountStore.accountForItems(nextProps.items);
  }

  _onOpenLabelsPopover = () => {
    if (!(this.props.items.length > 0)) {
      return;
    }
    if (this.context.sheetDepth !== WorkspaceStore.sheetStack().length - 1) {
      return;
    }
    Actions.openPopover(<LabelPickerPopover threads={this.props.items}
      account={this._account}
      onCreate={this._onCreateLabel} />, {
        originRect: this._labelEl.getBoundingClientRect(),
        direction: 'down',
        disablePointer: true,
      });
  };
  _onCreateLabel = (data, isMoveAction) => {
    Actions.openPopover(<CreateNewLabelPopover
      threads={this.props.items}
      account={this._account}
      currentPerspective={this.props.currentPerspective}
      name={data}
      isMoveAction={isMoveAction}
      onCancel={this._onCancelCreate} />, {
        isFixedToWindow: true,
        originRect: this._moveEl.getBoundingClientRect(),
        position: { top: '13%', left: '49%' },
        disablePointer: true,
      });
  };
  _onCreateFolder = (data) => {
    Actions.openPopover(<CreateNewFolderPopover
      threads={this.props.items}
      account={this._account}
      currentPerspective={this.props.currentPerspective}
      defaultValue={data}
      onCancel={this._onCancelCreate} />, {
        isFixedToWindow: true,
        originRect: this._moveEl.getBoundingClientRect(),
        position: { top: '13%', left: '49%' },
        disablePointer: true,
      });
  };
  _onCancelCreate = () => {
    Actions.closePopover();
  };

  _onOpenMovePopover = anchorEl => {
    if (!(this.props.items.length > 0)) {
      return;
    }
    if (this.context.sheetDepth !== WorkspaceStore.sheetStack().length - 1) {
      return;
    }
    let originRect;
    if (anchorEl
      && anchorEl.target
      && anchorEl.target.getBoundingClientRect
      && !(anchorEl instanceof CustomEvent)) {
      originRect = anchorEl.target.getBoundingClientRect();
    } else if (this._moveEl && this._moveEl.getBoundingClientRect) {
      originRect = this._moveEl.getBoundingClientRect();
    } else {
      AppEnv.reportError(new Error('Can not get anchor element for Move picker'));
      return;
    }
    const onCreate = this.state.isFolder ? this._onCreateFolder : this._onCreateLabel;
    Actions.openPopover(<MovePickerPopover threads={this.props.items}
      account={this._account}
      onClose={this._onCloseMoveFolderPopout}
      onCreate={onCreate} />, {
        originRect: originRect,
        direction: 'down',
        disablePointer: true,
      });
  };
  _onCloseMoveFolderPopout = () => {
    Actions.closePopover();
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
      <div className="button-group " style={{ order: -108 }}>
        <KeyCommandsRegion globalHandlers={handlers}>
          <button
            tabIndex={-1}
            ref={el => (this._moveEl = el)}
            title={'Move to Folder'}
            onClick={this._onOpenMovePopover}
            className={'btn btn-toolbar btn-category-picker btn-hide-when-crowded'}
          >
            <RetinaImg name={'folder.svg'} style={{ width: 24, height: 24 }} isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </button>
          {this._account.usesLabels() && (
            <button
              tabIndex={-1}
              ref={el => (this._labelEl = el)}
              title={'Apply Labels'}
              onClick={this._onOpenLabelsPopover}
              className={'btn btn-toolbar btn-category-picker btn-hide-when-crowded'}
            >
              <RetinaImg name={'label.svg'} style={{ width: 24, height: 24 }} isIcon
                mode={RetinaImg.Mode.ContentIsMask} />
            </button>
          )}
        </KeyCommandsRegion>
      </div>
    );
  }
}

module.exports = MovePicker;
