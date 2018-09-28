import React, { PureComponent } from 'react';
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

export default class NewTopBar extends PureComponent {
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
          </div>
        }
        right={
          groupMode ?
            <Button
              disabled={!createGroupEnabled}
              onTouchTap={() => onCreateGroupPressed()}
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
