import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Flexbox, RetinaImg } from 'mailspring-component-kit';
import {
  Actions,
  SyncbackCategoryTask,
  ChangeFolderTask,
  TaskFactory,
  TaskQueue,
  Folder,
} from 'mailspring-exports';

export default class CreateNewFolderPopover extends Component {
  static propTypes = {
    threads: PropTypes.array.isRequired,
    account: PropTypes.object.isRequired,
    onCancel: PropTypes.func,
    left: PropTypes.number,
    top: PropTypes.number,
  };
  static defaultProps = {
    left: 490,
    top: 107,
  };

  constructor(props) {
    super(props);
    this.state = {
      newName: '',
      alsoMove: true,
    };
  }

  componentDidMount() {
    document.body.addEventListener('click', this.onBlur);
  }

  componentWillUnmount() {
    document.body.removeEventListener('click', this.onBlur);
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
  _onCreateCategory = () => {
    const syncbackTask = SyncbackCategoryTask.forCreating({
      name: this.state.newName,
      accountId: this.props.account.id,
    });

    TaskQueue.waitForPerformRemote(syncbackTask).then(finishedTask => {
      if (!finishedTask.created) {
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
        }),
      );
      this.onCancel();
    }
  };
  _onNameChange = (e) => {
    this.setState({ newName: e.target.value });
  };

  renderButtons() {
    return <div className='button-row'>
      <button className="create-folder-btn-cancel" title="Cancel" onClick={this.onCancel}>
        <span>Cancel</span>
      </button>
      <button className="create-folder-btn-create" title="Compose new message" onClick={this._onCreateCategory}>
        <span>Create Folder</span>
      </button>
    </div>;
  }

  render() {
    return <div ref={(el) => this.container = el}
                style={{ left: this.props.left, top: this.props.top }}
                className={`move-folder-container ${this.props.visible ? 'hide' : ''}`}>
      <div className={'header-row'}>
        <RetinaImg name={'close_1.svg'} onClick={this.onCancel}
                   isIcon={true}
                   style={{ width: 20, height: 20 }}
                   mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
      <div className='header-text-container'>
        <div className='header-text'>New Folder</div>
        <div className='header-subtext'>What do you want to name it?</div>
      </div>
      <input className='folder-input'
             value={this.state.newName} placeholder={'Name'}
             onChange={this._onNameChange}/>
      {this.renderButtons()}
    </div>;
  }
}