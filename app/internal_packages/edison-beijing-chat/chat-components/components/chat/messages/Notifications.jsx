import React, { PureComponent } from 'react';
import { RetinaImg } from 'mailspring-component-kit';

export default class Notifications extends PureComponent {
  render() {
    const {
      notifications,
    } = this.props;
    return (
      <div
        className="group-notifications"
        style={{ height: notifications.length * 18 + 'px' }}
      >
        {notifications.map((item, idx) => {
          const from = item.from;
          const by = item.by;
          return (
            <div
              className='group-notification'
              key={idx}
            >
              <span className="group-notification-from">
                {from.nickname || from.name || from.email || from.jid}
              </span>
              <span className="group-notification-content">
                  {item.type} group {item.type === 'join' ? 'invited' : 'operated'} by
              </span>
              <span className="group-notification-by">
                  {by.nickname || by.name || by.email || by.jid}
              </span>
              <span className="group-notification-time">
                  {(' at ' + new Date(item.time || '2019/2/28')).toLocaleString()}
              </span>
            </div>
          );
        })
        }
      </div>
    );
  }
}
