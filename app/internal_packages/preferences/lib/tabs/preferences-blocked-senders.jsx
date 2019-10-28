import React from 'react';
import { BlockedSendersStore, EmailAvatar } from 'mailspring-exports';

class BlockedSenders extends React.Component {
  static displayName = 'PreferencesBlockedSenders';

  constructor() {
    super();
    this.state = {
      blockeds: this._getStateFromStores(),
      selections: [],
    };
  }

  componentDidMount() {
    this.unsubscribe = BlockedSendersStore.listen(this._onBlockedChanged);
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  _getStateFromStores() {
    const blockeds = BlockedSendersStore.getBlockedSenders();
    return blockeds;
  }

  _onBlockedChanged = () => {
    const blockeds = this._getStateFromStores();
    this.setState({ blockeds });
  };

  checkAllStatus = () => {
    const { blockeds, selections } = this.state;
    const selectionCount = selections.length;
    const isSelectAll = blockeds && blockeds.length && selectionCount === blockeds.length;
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
    // select all
    if (!checkStatus) {
      this._selectAll();
    }
    // deselect all
    else {
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
    const allBlockeds = this.state.blockeds.map(block => block.id);
    this.setState({ selections: allBlockeds });
  }

  _clearSelection() {
    this.setState({ selections: [] });
  }

  onInputChange = event => {
    console.log(event.target.value);
  };

  render() {
    const { blockeds } = this.state;
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
              blockeds && blockeds.length ? blockeds.length : 0
            } blocked senders`}</div>
            <span className={`unblockBtn${selectAllStatus ? ' show' : ''}`}>Unblock Selected</span>
            <div style={{ flex: 1 }}></div>
            <input type="text" placeholder="Find a contact" onChange={this.onInputChange} />
          </div>
          {blockeds.map(blocked => {
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
                <span className="unblockBtn">Unblock</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}

export default BlockedSenders;
