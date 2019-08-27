import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { RetinaImg, LottieImg } from 'mailspring-component-kit';
import {
  Actions,
  SyncbackCategoryTask,
  TaskFactory,
  TaskQueue,
  Folder,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

export default class CreateNewFolderPopover extends Component {
  static propTypes = {
    threads: PropTypes.array.isRequired,
    account: PropTypes.object.isRequired,
    onCancel: PropTypes.func,
    left: PropTypes.number,
    top: PropTypes.number,
    defaultValue: PropTypes.string,
    currentPerspective: PropTypes.object,
  };
  static defaultProps = {
    left: 490,
    top: 107,
    buttonTimeout: 700, // timeout in ms
    defaultValue: '',
  };

  constructor(props) {
    super(props);
    this.state = {
      newName: '',
      alsoMove: true,
      isBusy: false,
    };
    this._mounted = false;
    this._buttonTimer = null;
    this._buttonTimestamp = 0;
  }
  componentWillMount() {
    if (this.props.defaultValue && this.props.defaultValue.length > 0) {
      this.setState({ newName: this.props.defaultValue });
    }
  }

  componentDidMount() {
    this._mounted = true;
    document.body.addEventListener('click', this.onBlur);
  }

  componentWillUnmount() {
    this._mounted = false;
    document.body.removeEventListener('click', this.onBlur);
    clearTimeout(this._buttonTimer);
  }

  onCancel = () => {
    if (this.props.onCancel) {
      this.props.onCancel();
    }
  };

  onBlur = (e) => {
    const rect = this.container.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      this.onCancel();
    }
  };

  _onBusyTimeout = () => {
    if (!this._mounted) {
      return;
    }
    if (!this._buttonTimer) {
      this._buttonTimestamp = Date.now();
      this._buttonTimer = setTimeout(() => {
        this.setState({ isBusy: false });
        this._buttonTimer = null;
      }, this.props.buttonTimeout * 2);
    }
  };
  _onResultReturned = () => {
    if (!this._mounted) {
      return;
    }
    if (!this._buttonTimer) {
      this._buttonTimestamp = Date.now();
      this._buttonTimer = setTimeout(() => {
        this.setState({ isBusy: false });
        this._buttonTimer = null;
      }, this.props.buttonTimeout);
    } else {
      const now = Date.now();
      clearTimeout(this._buttonTimer);
      if (now - this._buttonTimestamp < this.props.buttonTimeout) {
        this._buttonTimestamp = Date.now();
        this._buttonTimer = setTimeout(() => {
          this.setState({ isBusy: false });
          this._buttonTimer = null;
        }, this.props.buttonTimeout);
      } else {
        this._buttonTimer = null;
        this.setState({ isBusy: false });
      }
    }
  };
  _onCreateCategory = () => {
    this.setState({ isBusy: true });
    const syncbackTask = SyncbackCategoryTask.forCreating({
      name: this.state.newName,
      accountId: this.props.account.id,
    });
    this._onResultReturned();
    TaskQueue.waitForPerformRemote(syncbackTask).then(finishedTask => {
      if (!finishedTask.created) {
        this._onBusyTimeout();
        this.setState({ newName: '' });
        AppEnv.showErrorDialog({ title: 'Error', message: `Could not create folder.` });
        return;
      }
      this._onMoveToCategory({ category: finishedTask.created });
    });
    Actions.queueTask(syncbackTask);
  };

  _onMoveToCategory = ({ category }) => {
    const { threads } = this.props;
    if (category instanceof Folder) {
      Actions.queueTasks(
        TaskFactory.tasksForChangeFolder({
          source: 'Category Picker: New Category',
          threads: threads,
          folder: category,
          currentPerspective: FocusedPerspectiveStore.current()
        }),
      );
      this.onCancel();
      this._onResultReturned();
    }
  };
  _onNameChange = (e) => {
    if (!this.state.isBusy) {
      this.setState({ newName: e.target.value });
    }
  };

  renderButtons() {
    return <div className='button-row'>
      <button className="create-folder-btn-cancel" title="Cancel" onClick={this.onCancel}>
        <span>Cancel</span>
      </button>
      <button className="create-folder-btn-create" title="Create Folder"
        disabled={this.state.newName.length === 0} onClick={this._onCreateCategory}>
        {(this.state.isBusy || this._buttonTimer) ?
          <LottieImg name={'loading-spinner-white'}
            height={24} width={24}
            style={{ width: 24, height: 24 }} /> :
          <span>Create Folder</span>}
      </button>
    </div>;
  }

  render() {
    return <div ref={(el) => this.container = el}
      className={`create-folder-container ${this.props.visible ? 'hide' : ''}`}>
      <div className={'header-row'}>
        <span className="close" onClick={this.onCancel}>
          <RetinaImg
            name="close_1.svg"
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ width: 20 }}
          />
        </span>
      </div>
      <div className='header-text-container'>
        <div className='header-text'>New Folder</div>
        <div className='header-subtext'>What do you want to name it?</div>
      </div>
      <input className='folder-input'
        value={this.state.newName} placeholder={'Name'}
        disabled={this.state.isBusy}
        onChange={this._onNameChange} />
      {this.renderButtons()}
    </div>;
  }
}