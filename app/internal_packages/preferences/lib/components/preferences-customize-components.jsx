import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';
import ConfigSchemaItem from './config-schema-item';

export class CustomizeQuickActions extends React.Component {
  static displayName = 'PreferencesCustomizeQuickActions';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };
  constructor(props) {
    super(props);
    this.state = {};
  }

  _renderActionIcon = idx => {
    const iconName = AppEnv.config.get(`core.quickActions.quickAction${idx}`);
    return (
      <RetinaImg
        name={`${iconName}.svg`}
        style={{ width: 24, height: 24 }}
        className={`action_icon action_${idx}`}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
      />
    );
  };

  render() {
    const { label, config, configSchema } = this.props;
    const enabled = config.get('core.quickActions.enabled');
    const quickActionsConfigSchema = configSchema.properties.quickActions.properties;
    return (
      <div>
        <ConfigSchemaItem
          configSchema={quickActionsConfigSchema.enabled}
          keyPath={'core.quickActions.enabled'}
          config={config}
          label={label}
        />
        <div className="quick-action-preview">
          <RetinaImg
            style={{ width: 500 }}
            name={`prefs-quick-actions.png`}
            mode={RetinaImg.Mode.ContentPreserve}
          />
          {this._renderActionIcon(1)}
          {this._renderActionIcon(2)}
          {this._renderActionIcon(3)}
          {this._renderActionIcon(4)}
        </div>
        {enabled ? (
          <div>
            <ConfigSchemaItem
              configSchema={quickActionsConfigSchema.quickAction1}
              keyPath={'core.quickActions.quickAction1'}
              config={config}
              label={quickActionsConfigSchema.quickAction1.title}
            />
            <ConfigSchemaItem
              configSchema={quickActionsConfigSchema.quickAction2}
              keyPath={'core.quickActions.quickAction2'}
              config={config}
              label={quickActionsConfigSchema.quickAction2.title}
            />
            <ConfigSchemaItem
              configSchema={quickActionsConfigSchema.quickAction3}
              keyPath={'core.quickActions.quickAction3'}
              config={config}
              label={quickActionsConfigSchema.quickAction3.title}
            />
            <ConfigSchemaItem
              configSchema={quickActionsConfigSchema.quickAction4}
              keyPath={'core.quickActions.quickAction4'}
              config={config}
              label={quickActionsConfigSchema.quickAction4.title}
            />
          </div>
        ) : null}
      </div>
    );
  }
}

export class CustomizeSwipeActions extends React.Component {
  static displayName = 'PreferencesCustomizeSwipeActions';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
    label: PropTypes.string,
  };
  constructor(props) {
    super(props);
    this.state = {};
  }

  _renderActionColor = idx => {
    const iconName = AppEnv.config.get(`core.swipeActions.${idx}`);
    return <div className={`action_color color_${iconName}`}></div>;
  };

  render() {
    const { label, config, configSchema } = this.props;
    const enabled = config.get('core.swipeActions.enabled');
    const swipeActionsConfigSchema = configSchema.properties.swipeActions.properties;
    return (
      <div>
        <ConfigSchemaItem
          configSchema={swipeActionsConfigSchema.enabled}
          keyPath={'core.swipeActions.enabled'}
          config={config}
          label={label}
        />
        <div className="swipe-action-preview">
          <RetinaImg
            style={{ width: 500 }}
            name={`prefs-swipe-colors.png`}
            mode={RetinaImg.Mode.ContentPreserve}
          />
          {this._renderActionColor('leftShortAction')}
          {this._renderActionColor('leftLongAction')}
          {this._renderActionColor('rightShortAction')}
          {this._renderActionColor('rightLongAction')}
        </div>
        {enabled ? (
          <div>
            <ConfigSchemaItem
              configSchema={swipeActionsConfigSchema.leftShortAction}
              keyPath="core.swipeActions.leftShortAction"
              config={config}
              label={swipeActionsConfigSchema.leftShortAction.title}
            />
            <ConfigSchemaItem
              configSchema={swipeActionsConfigSchema.leftLongAction}
              keyPath="core.swipeActions.leftLongAction"
              config={config}
              label={swipeActionsConfigSchema.leftLongAction.title}
            />
            <ConfigSchemaItem
              configSchema={swipeActionsConfigSchema.rightShortAction}
              keyPath="core.swipeActions.rightShortAction"
              config={config}
              label={swipeActionsConfigSchema.rightShortAction.title}
            />
            <ConfigSchemaItem
              configSchema={swipeActionsConfigSchema.rightLongAction}
              keyPath="core.swipeActions.rightLongAction"
              config={config}
              label={swipeActionsConfigSchema.rightLongAction.title}
            />
          </div>
        ) : null}
      </div>
    );
  }
}

export class CustomizeEmailActions extends React.Component {
  static displayName = 'PreferencesCustomizeEmailActions';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };
  constructor(props) {
    super(props);
  }

  _renderActionIcon = idx => {
    const iconName = AppEnv.config.get(`core.mailActions.mailAction${idx}`);
    return (
      <RetinaImg
        name={`${iconName}.svg`}
        style={{ width: 24, height: 24 }}
        className={`action_icon action_${idx}`}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
      />
    );
  };

  render() {
    const { config, configSchema } = this.props;
    const mailActionsConfigSchema = configSchema.properties.mailActions.properties;
    return (
      <div>
        <div className="email-action-preview">
          <RetinaImg
            style={{ width: 500 }}
            name={`prefs-email-actions.png`}
            mode={RetinaImg.Mode.ContentPreserve}
          />
          {this._renderActionIcon(1)}
          {this._renderActionIcon(2)}
          {this._renderActionIcon(3)}
          {this._renderActionIcon(4)}
          {this._renderActionIcon(5)}
        </div>
        <div className="email-actions">
          <ConfigSchemaItem
            configSchema={mailActionsConfigSchema.mailAction1}
            keyPath={'core.mailActions.mailAction1'}
            config={config}
            label={mailActionsConfigSchema.mailAction1.title}
          />
          <ConfigSchemaItem
            configSchema={mailActionsConfigSchema.mailAction2}
            keyPath={'core.mailActions.mailAction2'}
            config={config}
            label={mailActionsConfigSchema.mailAction2.title}
          />
          <ConfigSchemaItem
            configSchema={mailActionsConfigSchema.mailAction3}
            keyPath={'core.mailActions.mailAction3'}
            config={config}
            label={mailActionsConfigSchema.mailAction3.title}
          />
          <ConfigSchemaItem
            configSchema={mailActionsConfigSchema.mailAction4}
            keyPath={'core.mailActions.mailAction4'}
            config={config}
            label={mailActionsConfigSchema.mailAction4.title}
          />
          <ConfigSchemaItem
            configSchema={mailActionsConfigSchema.mailAction5}
            keyPath={'core.mailActions.mailAction5'}
            config={config}
            label={mailActionsConfigSchema.mailAction5.title}
          />
        </div>
      </div>
    );
  }
}
