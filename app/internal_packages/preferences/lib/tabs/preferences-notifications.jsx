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
        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.emailNotifications}
          keyName="EMAIL NOTIFICATIONS"
          keyPath="core.emailNotifications"
          config={this.props.config}
        />
        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.chatNotifications}
          keyName="CHAT NOTIFICATIONS"
          keyPath="core.chatNotifications"
          config={this.props.config}
        />
      </div>
    );
  }
}

export default Notifications;
