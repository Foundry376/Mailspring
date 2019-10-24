import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg, Flexbox } from 'mailspring-component-kit';

export default class ModeSwitch extends React.Component {
  static displayName = 'ModeSwitch';
  static propTypes = {
    modeSwitch: PropTypes.array.isRequired,
    config: PropTypes.object.isRequired,
    activeValue: PropTypes.any.isRequired,
    imgActive: PropTypes.bool,
    onSwitchOption: PropTypes.function,
  };

  constructor(props) {
    super();
    this.state = {
      value: props.activeValue,
    };
  }

  _onClick(modeInfo) {
    this.setState({ value: modeInfo.value }, () => this.props.onSwitchOption(modeInfo.value));
  }

  render() {
    const { modeSwitch, imgActive } = this.props;
    const { value } = this.state;

    return (
      <div className="appearance-mode-switch">
        <Flexbox direction="row" style={{ alignItems: 'center' }} className="item">
          {modeSwitch.map(modeInfo => {
            const active = value === modeInfo.value;
            const classname = `appearance-mode${active ? ' active' : ''}`;

            return (
              <div className={classname} onClick={() => this._onClick(modeInfo)}>
                <RetinaImg name={modeInfo.imgsrc} mode="" active={active && imgActive} />
                <div>{modeInfo.label}</div>
              </div>
            );
          })}
        </Flexbox>
      </div>
    );
  }
}
