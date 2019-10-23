import React from 'react';
import PropTypes from 'prop-types';
import ConfigSchemaItem from './config-schema-item';

class Notifications extends React.Component {
  static displayName = 'PreferencesNotifications';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <div className="container-notifications">
        <div className="config-group">
          <h6>EMAIL NOTIFICATIONS</h6>
          <ConfigSchemaItem
            configSchema={this.props.configSchema.properties.notifications.properties.enabled}
            keyName="EMAIL NOTIFICATIONS"
            keyPath="core.notifications.enabled"
            config={this.props.config}
          />
          <ConfigSchemaItem
            configSchema={this.props.configSchema.properties.notifications.properties.countBadge}
            keyName="EMAIL NOTIFICATIONS"
            keyPath="core.notifications.countBadge"
            config={this.props.config}
          />
        </div>
      </div>
    );
  }
}

export default Notifications;
