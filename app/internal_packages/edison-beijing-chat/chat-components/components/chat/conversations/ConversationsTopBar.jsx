import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../common/Button';
import ComposeIcon from '../../common/icons/ComposeIcon';
import { theme } from '../../../utils/colors';
import TopBar from '../../common/TopBar';
import CancelIcon from '../../common/icons/CancelIcon';
import BackIcon from '../../common/icons/BackIcon';

export default class ConversationsTopBar extends PureComponent {
  render() {
    return (
      <TopBar
        left={
          // <Link to="/">
          //   <Button>
          //     <BackIcon color={theme.primaryColor} />
          //   </Button>
          // </Link>
          <div className="left-title">MESSAGES</div>
        }
        // center={}
        right={
          <Link to="/chat/new">
            <Button className="button new-message">
              <span style={{ fontSize: '16px' }}>+</span> New
            </Button>
          </Link>
        }
      />
    );
  }
}