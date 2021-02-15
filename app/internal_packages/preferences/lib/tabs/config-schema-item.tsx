import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import _str from 'underscore.string';
import { ConfigLike, ConfigSchemaLike } from '../types';

/*
This component renders input controls for a subtree of the Mailspring config-schema
and reads/writes current values using the `config` prop, which is expected to
be an instance of the config provided by `ConfigPropContainer`.

The config schema follows the JSON Schema standard: http://json-schema.org/
*/
interface ConfigSchemaItemProps {
  keyName?: string;
  keyPath: string;
  config: ConfigLike;
  configSchema: ConfigSchemaLike;
}

class ConfigSchemaItem extends React.Component<ConfigSchemaItemProps> {
  static displayName = 'ConfigSchemaItem';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
    keyName: PropTypes.string,
    keyPath: PropTypes.string,
  };

  _appliesToPlatform() {
    if (!this.props.configSchema.platform) {
      return true;
    } else if (this.props.configSchema.platforms.indexOf(process.platform) !== -1) {
      return true;
    }
    return false;
  }

  _onChangeChecked = event => {
    this.props.config.toggle(this.props.keyPath);
    event.target.blur();
  };

  _onChangeValue = event => {
    this.props.config.set(this.props.keyPath, event.target.value);
    event.target.blur();
  };

  render() {
    if (!this._appliesToPlatform()) return false;

    // In the future, we may add an option to reveal "advanced settings"
    if (this.props.configSchema.advanced) return false;

    const note = this.props.configSchema.note ? (
      <div className="platform-note">{this.props.configSchema.note}</div>
    ) : null;

    if (this.props.configSchema.type === 'object') {
      return (
        <section>
          <h6>{_str.humanize(this.props.keyName)}</h6>
          {Object.entries(this.props.configSchema.properties).map(([key, value]) => (
            <ConfigSchemaItem
              key={key}
              keyName={key}
              keyPath={`${this.props.keyPath}.${key}`}
              configSchema={value}
              config={this.props.config}
            />
          ))}
          {note}
        </section>
      );
    } else if (this.props.configSchema.enum) {
      return (
        <div className="item">
          <label htmlFor={this.props.keyPath} style={{ paddingRight: 8 }}>
            {this.props.configSchema.title}:
          </label>
          <select onChange={this._onChangeValue} value={this.props.config.get(this.props.keyPath)}>
            {_.zip(this.props.configSchema.enum, this.props.configSchema.enumLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
          {note}
        </div>
      );
    } else if (this.props.configSchema.type === 'boolean') {
      return (
        <div className="item">
          <input
            id={this.props.keyPath}
            type="checkbox"
            onChange={this._onChangeChecked}
            checked={!!this.props.config.get(this.props.keyPath)}
          />
          <label htmlFor={this.props.keyPath}>{this.props.configSchema.title}</label>
          {note}
        </div>
      );
    }
    return <span />;
  }
}

export default ConfigSchemaItem;
