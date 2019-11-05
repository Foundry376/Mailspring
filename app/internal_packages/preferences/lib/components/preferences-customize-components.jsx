import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';

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
    return (
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
    );
  }
}

export class CustomizeSwipeActions extends React.Component {
  static displayName = 'PreferencesCustomizeSwipeActions';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
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
    return (
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
    );
  }
}
