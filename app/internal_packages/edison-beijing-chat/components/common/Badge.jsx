import React, { PureComponent } from 'react';

export default class ConversationBadge extends PureComponent {
  render() {
    const { count = 0 } = this.props;
    return count > 0 ? <div className="badge">{count > 99 ? '99+' : count}</div> : null;
  }
}
