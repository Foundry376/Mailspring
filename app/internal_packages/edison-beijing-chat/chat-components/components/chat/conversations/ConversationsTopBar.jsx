import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../common/Button';
import ComposeIcon from '../../common/icons/ComposeIcon';
import { theme } from '../../../utils/colors';
import TopBar from '../../common/TopBar';

export default class ConversationsTopBar extends PureComponent {
  render() {
    return (
      <TopBar
        center={
          <div style={{ fontSize: 14 }}>Conversations</div>
        }
        right={
          <Link to="/chat/new">
            <Button>
              <ComposeIcon color={theme.primaryColor} />
            </Button>
          </Link>
        }
      />
    );
  }
}
