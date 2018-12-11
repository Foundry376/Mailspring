import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import BackIcon from '../../common/icons/BackIcon';
import CancelIcon from '../../common/icons/CancelIcon';
import CreateGroupIcon from '../../common/icons/CreateGroupIcon';
import DoneIcon from '../../common/icons/DoneIcon';
import { theme } from '../../../utils/colors';

const { primaryColor } = theme;

export default class NewTopBar extends Component {
  static propTypes = {
    onCancelGroupModePressed: PropTypes.func,
    onCreateGroupPressed: PropTypes.func,
    onEnterGroupModePressed: PropTypes.func,
    groupMode: PropTypes.bool,
    createGroupEnabled: PropTypes.bool,
  }

  static defaultProps = {
    onCancelGroupModePressed: () => { },
    onCreateGroupPressed: () => { },
    onEnterGroupModePressed: () => { },
    groupMode: false,
    createGroupEnabled: false,
  }

  constructor() {
    super()
    this.state = {}
  }

  onCreateGroup = () => {
    this.setState({ openInput: true })
    // this.props.onCreateGroupPressed()
  }

  onStartGroupChat = () => {
    let name = this.chatNameInput.value.trim();
    if (!name) {
      this.setState({ openInput: true, needName: true })
      return;
    } else {
      this.setState({ openInput: false, needName: false });
      this.props.onCreateGroupPressed(name);
    }
  }

  render() {
    const {
      onCancelGroupModePressed,
      onCreateGroupPressed,
      onEnterGroupModePressed,
      groupMode,
      createGroupEnabled,
    } = this.props;

    return (
      <TopBar
        left={
          groupMode ?
            <Button className="no-border" onTouchTap={() => onCancelGroupModePressed()}>
              <CancelIcon color={primaryColor} />
            </Button> :
            <Link to="/chat">
              <Button className="no-border">
                <BackIcon color={primaryColor} />
              </Button>
            </Link>
        }
        center={
          <div className="mid-title">
            New {groupMode ? 'Group' : 'Conversation'}
            {this.state.openInput && (
              <div id="input-group-name-dialog">
                <h6 id="input-group-name-dialog-title">Group chat name</h6>
                <input ref={(el) => this.chatNameInput = el}></input>
                {this.state.needName && <p style={{ color: "red" }}>please input a chat name</p>}
                <Button onTouchTap={this.onStartGroupChat}>OK</Button>
              </div>
            )}
          </div>
        }
        right={
          groupMode ?
            <Button
              className="no-border"
              disabled={!createGroupEnabled}
              onTouchTap={this.onCreateGroup}
            >
              <DoneIcon color={primaryColor} />
            </Button> :
            <Button
              className="no-border"
              onTouchTap={() => onEnterGroupModePressed()}
            >
              <CreateGroupIcon color={primaryColor} />
            </Button>
        }
      />
    );
  }
}
