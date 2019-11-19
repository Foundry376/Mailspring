import {
  Utils,
  CategoryStore,
  FocusedPerspectiveStore,
  SiftStore,
  Actions
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';

const STOP_REFRESHING_DELAY = 15000;

class RefreshButton extends Component {
  static displayName = 'RefreshButton';

  static propTypes = {
    renderRefresh: PropTypes.bool,
  };
  static defaultProps = {
    renderRefresh: true,
  };

  constructor(props) {
    super(props);
    this.state = {
      refreshingMessages: false,
      previousPerspectiveName: '',
      previousUpdatedTime: '',
      cachedSyncFolderData: null,
      lastUpdatedTime: FocusedPerspectiveStore.getLastUpdatedTime(),
    };
    this.refreshTimer = null;
    this.refreshDelay = 300;
    this.stopRefreshingTimer = null;
    this.mounted = false;
    this._unlisten = null;
  }

  componentDidMount() {
    this.mounted = true;
    this._unlisten = [
      CategoryStore.listen(this._onCategoryChange),
      FocusedPerspectiveStore.listen(this._onCategoryChange),
    ];
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate = () => {
    const perspective = FocusedPerspectiveStore.current();
    const updatedTime = FocusedPerspectiveStore.getLastUpdatedTime();
    const state = {};
    if (this.state.previousPerspectiveName !== perspective.name) {
      state.previousPerspectiveName = perspective.name;
      state.previousUpdatedTime = updatedTime;
      state.refreshingMessages = false;
    } else if (this.state.previousUpdatedTime !== updatedTime) {
      state.previousUpdatedTime = updatedTime;
      state.refreshingMessages = false;
    }
    if (state.refreshingMessages === false) {
      this.stopRefreshing();
      delete state.refreshingMessages;
    }
    this.setState(state);
  };

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.stopRefreshingTimer);
    if (Array.isArray(this._unlisten)) {
      this._unlisten.forEach(unlisten => {
        unlisten();
      });
    }
  }

  _onCategoryChange = () => {
    if (this.mounted) {
      const lastUpdatedTime = FocusedPerspectiveStore.getLastUpdatedTime();
      if (lastUpdatedTime > this.state.lastUpdatedTime) {
        this.setState({ lastUpdatedTime });
      }
    }
  };

  stopRefreshing = () => {
    if (!this.stopRefreshingTimer) {
      clearTimeout(this.stopRefreshingTimer);
      this.stopRefreshingTimer = null;
    }
    if (!this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        if (this.mounted) {
          this.setState({ refreshingMessages: false, cachedSyncFolderData: null });
        }
        this.refreshTimer = null;
      }, this.refreshDelay);
    }
  };

  refreshPerspective = () => {
    if (!this.state.refreshingMessages) {
      const current = FocusedPerspectiveStore.current();
      const accounts = FocusedPerspectiveStore.refreshPerspectiveMessages();
      this.setState({ refreshingMessages: true, cachedSyncFolderData: accounts });
      this.stopRefreshingTimer = setTimeout(this.stopRefreshing, STOP_REFRESHING_DELAY);

      if (current.sift) {
        this.siftRefresh();
      }
    }
  };

  _syncSiftData = _.throttle(categories => {
    Actions.syncSiftFolder({ categories });
  }, 500);

  siftRefresh = () => {
    const category = SiftStore.siftCategory();
    if (category) {
      this._syncSiftData([category]);
    }
  };

  renderRefreshButton(perspective) {
    if (!this.props.renderRefresh) {
      return null;
    }
    if (!perspective) {
      return null;
    }
    // if (perspective.starred) {
    //   return null;
    // }
    return (
      <button
        tabIndex={-1}
        style={{ cursor: 'pointer' }}
        className="btn btn-toolbar item-refresh"
        title="Refresh"
        onClick={this.refreshPerspective}
      >
        <RetinaImg
          name="refresh.svg"
          className={this.state.refreshingMessages ? 'infinite-rotation-linear' : ''}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }

  render() {
    const current = FocusedPerspectiveStore.current();
    return (
      this.renderRefreshButton(current)
    );
  }
}

export default RefreshButton;
