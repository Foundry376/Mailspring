import React from 'react';
import {
  Message,
} from 'mailspring-exports';

interface UnsubscribeHeaderProps {
  message: Message;
  unsubscribeAction: UnsubscribeAction;
}

interface UnsubscribeHeaderState {
}


interface UnsubscribeAction {
  unsubscribe(): void
}

/*
The UnsubscribeHeader allows you to unsubscribe from a mailinglist easily using either
the e-mail address denoted in the unsubscribe header of the e-mail or an unsubscribe
link from the e-mail message itself.
*/
export class UnsubscribeHeader extends React.Component<UnsubscribeHeaderProps, UnsubscribeHeaderState> {
  static displayName = 'UnsubscribeHeader';

  state = {};

  componentWillUnmount() {
  }

  componentDidMount() {
    const { message, unsubscribeAction } = this.props;
  }

  componentDidUpdate(prevProps, prevState) {
  }

  render() {
    return (
      <div className="event-wrapper">
        <div className="event-header">
          Unsubscribe from the mailinglist.
        </div>
      </div>
    );
  }

}

export default UnsubscribeHeader;
