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
    onCancelGroupModePressed: () => {},
    onCreateGroupPressed: () => {},
    onEnterGroupModePressed: () => {},
    groupMode: false,
    createGroupEnabled: false,
  }

  constructor(){
    super()
    this.state = {}
  }

  onCreateGroup = () => {
    console.log('new conversation onCreateGroup');
    this.setState({openInput:true})
    // this.props.onCreateGroupPressed()
  }

  onStartGroupChat = () => {
    let name = this.chatNameInput.value.trim();
    if (!name) {
      this.setState({ openInput: true, needName: true })
      return;
    } else {
      console.log('onStartGroupChat', name);
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
            <Button onTouchTap={() => onCancelGroupModePressed()}>
              <CancelIcon color={primaryColor} />
            </Button> :
            <Link to="/chat">
              <Button>
                <BackIcon color={primaryColor} />
              </Button>
            </Link>
        }
        center={
          <div style={{ fontSize: 14, textAlign: 'center' }}>
            New {groupMode ? 'Group' : 'Conversation'}
            {this.state.openInput && <div style={{position:"absolute", top:"60px", left:"800px", border:"1px solid black"}}>
              <h6 style={{backgroundColor:"lightgray", color:"blue", border:"1px solid lightgray", margin:0}}>the name for the group chat</h6>
              <input placeholder={"input here..."} ref={(el) => this.chatNameInput = el }></input>
              {this.state.needName && <p style={{color:"red"}}>please input a chat name!</p>}
              <input type={"button"} onClick={this.onStartGroupChat} value={"ok"}></input>
            </div>
            }
          </div>
        }
        right={
          groupMode ?
            <Button
              disabled={!createGroupEnabled}
              onTouchTap={this.onCreateGroup}
            >
              <DoneIcon color={primaryColor} />
            </Button> :
            <Button
              onTouchTap={() => onEnterGroupModePressed()}
            >
              <CreateGroupIcon color={primaryColor} />
            </Button>
        }
      />
    );
  }
}
