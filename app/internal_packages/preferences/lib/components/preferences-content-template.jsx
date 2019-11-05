import React from 'react';
import PropTypes from 'prop-types';
import ConfigSchemaItem from './config-schema-item';

class PreferencesContentTemplate extends React.Component {
  static displayName = 'PreferencesContentTemplate';
  static propTypes = {
    className: PropTypes.string,
    configGroup: PropTypes.array,
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };

  constructor(props) {
    super();
  }

  _renderConfigGroup = (config, index) => {
    return (
      <div className={config.groupName ? 'config-group' : ''} key={index}>
        {config.groupName ? <h6>{config.groupName.toUpperCase()}</h6> : null}
        {config.groupItem && config.groupItem.length
          ? config.groupItem.map(item => {
              const configSchema =
                item.configSchema && typeof item.configSchema === 'function'
                  ? item.configSchema(this.props.configSchema)
                  : null;
              if (item.label && item.component) {
                const ItemComponent = item.component;
                return (
                  <ItemComponent
                    key={item.label}
                    keyPath={item.keyPath}
                    configSchema={configSchema}
                    config={this.props.config}
                    label={item.label}
                  />
                );
              }
              if (item.keyPath && item.label && configSchema) {
                return (
                  <ConfigSchemaItem
                    key={item.label}
                    configSchema={configSchema}
                    keyPath={item.keyPath}
                    config={this.props.config}
                    label={item.label}
                  />
                );
              }
              return null;
            })
          : null}
      </div>
    );
  };

  render() {
    const { className, configGroup } = this.props;
    return (
      <div className={className ? className : ''}>
        {configGroup && configGroup.length
          ? configGroup.map((config, index) => this._renderConfigGroup(config, index))
          : null}
      </div>
    );
  }
}

export default PreferencesContentTemplate;
