import React from 'react';

class Notifications extends React.Component {
  static displayName = 'PreferencesNotifications';

  constructor() {
    super();
    this.state = {};
  }

  render() {
    return (
      <div className="container-notifications">
        <h3>Notifications</h3>
      </div>
    );
  }
}

export default Notifications;
