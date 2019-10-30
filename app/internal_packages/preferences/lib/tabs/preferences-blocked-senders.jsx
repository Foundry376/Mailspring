import React from 'react';
import { BlockedSendersStore, EmailAvatar } from 'mailspring-exports';
import { InputSearch } from 'mailspring-component-kit';

class BlockedSenders extends React.Component {
  static displayName = 'PreferencesBlockedSenders';

  constructor() {
    super();
    this.state = {
      blockeds: [],
      selections: [],
      searchValue: '',
      filterList: [],
    };
  }

  componentDidMount() {
    this.unsubscribe = BlockedSendersStore.listen(this._onBlockedChanged);
    const blockeds = this._getStateFromStores();
    this.setState({ blockeds: blockeds }, () => {
      this._filterBlockedsBySearchValue();
    });
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _filterBlockedsBySearchValue() {
    const { searchValue, blockeds, selections } = this.state;
    const filterList = blockeds.filter(block => {
      return block.name.indexOf(searchValue) >= 0 || block.email.indexOf(searchValue) >= 0;
    });
    const filterIdList = filterList.map(block => block.id);
    const newSelections = selections.filter(id => filterIdList.indexOf(id) >= 0);
    this.setState({ filterList, selections: newSelections });
  }

  _getStateFromStores() {
    const blockeds = BlockedSendersStore.getBlockedSenders();
    return blockeds;
  }

  _onBlockedChanged = () => {
    const blockeds = this._getStateFromStores();
    this.setState({ blockeds }, () => {
      this._filterBlockedsBySearchValue();
    });
  };

  checkAllStatus = () => {
    const { filterList, selections } = this.state;
    const selectionCount = selections.length;
    const isSelectAll = filterList && filterList.length && selectionCount === filterList.length;
    if (isSelectAll) {
      return 'selected';
    } else if (selectionCount) {
      return 'some-selected';
    }
    return '';
  };

  checkStatus = id => {
    const { selections } = this.state;
    if (selections.indexOf(id) >= 0) {
      return 'selected';
    } else {
      return '';
    }
  };

  onToggleSelectAll = () => {
    const checkStatus = this.checkAllStatus();
    if (!checkStatus) {
      this._selectAll();
    } else {
      this._clearSelection();
    }
  };

  onToggleSelect = id => {
    const checkStatus = this.checkStatus(id);
    let newSelections;
    if (checkStatus) {
      newSelections = this.state.selections.filter(selectionId => selectionId !== id);
    } else {
      newSelections = [id, ...this.state.selections];
    }
    this.setState({ selections: newSelections });
  };

  _selectAll() {
    const allBlockeds = this.state.filterList.map(block => block.id);
    this.setState({ selections: allBlockeds });
  }

  _clearSelection() {
    this.setState({ selections: [] });
  }

  onInputChange = value => {
    this.setState({ searchValue: value }, () => {
      this._filterBlockedsBySearchValue();
    });
  };

  _unBlockSelect() {
    const unBlockedIds = this.state.selections;
    const blockedIdEmailMapping = new Map();
    this.state.filterList.forEach(block => {
      blockedIdEmailMapping.set(block.id, block.email);
    });
    const unBlockedEmails = unBlockedIds.map(id => blockedIdEmailMapping.get(id));
    BlockedSendersStore.unBlockEmails(unBlockedEmails);
  }

  _unBlockItem(email) {
    BlockedSendersStore.unBlockEmails([email]);
  }

  render() {
    const { filterList } = this.state;
    const selectAllStatus = this.checkAllStatus();

    return (
      <div className="container-blocked">
        <div className="config-group">
          <h6>BLOCKED SENDERS</h6>
          <div className="blocked-note">
            Contacts you have blocked in your email will appear here. To unblock them, remove their
            name from this list.
          </div>
        </div>

        <ul>
          <div className="header">
            <div className={`checkmark ${selectAllStatus}`} onClick={this.onToggleSelectAll}></div>
            <div className="checkmark-note">{`${
              filterList && filterList.length ? filterList.length : 0
            } blocked senders`}</div>
            <span
              className={`unblockBtn${selectAllStatus ? ' show' : ''}`}
              onClick={() => this._unBlockSelect()}
            >
              Unblock Selected
            </span>
            <div style={{ flex: 1 }}></div>
            <div className="search-box">
              <InputSearch
                showPreIcon
                showClearIcon
                placeholder="Find a contact"
                onChange={this.onInputChange}
              />
            </div>
          </div>
          {filterList.map(blocked => {
            const selectStatus = this.checkStatus(blocked.id);

            return (
              <li key={blocked.id} className={`${selectStatus}`}>
                <div
                  className={`checkmark ${selectStatus}`}
                  onClick={() => this.onToggleSelect(blocked.id)}
                ></div>
                <EmailAvatar
                  key="email-avatar"
                  account={{ name: blocked.name, email: blocked.email }}
                />
                <span>{blocked.name}</span>
                {blocked.email}
                <span className="unblockBtn" onClick={() => this._unBlockItem(blocked.email)}>
                  Unblock
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}

export default BlockedSenders;
