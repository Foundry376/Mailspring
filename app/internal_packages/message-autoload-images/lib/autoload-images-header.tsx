import React from 'react';
import { localized, PropTypes, Message } from 'mailspring-exports';

import AutoloadImagesStore from './autoload-images-store';
import Actions from './autoload-images-actions';

export default class AutoloadImagesHeader extends React.Component<
  { message: Message },
  { blocking: boolean }
> {
  static displayName = 'AutoloadImagesHeader';

  static propTypes = {
    message: PropTypes.instanceOf(Message).isRequired,
  };

  _unlisten?: () => void;

  constructor(props) {
    super(props);
    this.state = {
      blocking: AutoloadImagesStore.shouldBlockImagesIn(this.props.message),
    };
  }

  componentDidMount() {
    this._unlisten = AutoloadImagesStore.listen(() => {
      const blocking = AutoloadImagesStore.shouldBlockImagesIn(this.props.message);
      if (blocking !== this.state.blocking) {
        this.setState({ blocking });
      }
    });
  }

  componentWillReceiveProps(nextProps) {
    const blocking = AutoloadImagesStore.shouldBlockImagesIn(nextProps.message);
    if (blocking !== this.state.blocking) {
      this.setState({ blocking });
    }
  }

  componentWillUnmount() {
    this._unlisten();
  }

  render() {
    const { message } = this.props;
    const { blocking } = this.state;

    if (blocking === false) {
      return <div />;
    }

    return (
      <div className="autoload-images-header">
        <a className="option" onClick={() => Actions.temporarilyEnableImages(message)}>
          {localized('Show Images')}
        </a>
        <span style={{ paddingLeft: 10, paddingRight: 10 }}>|</span>
        <a className="option" onClick={() => Actions.permanentlyEnableImages(message)}>
          {localized('Always show images from %@', message.fromContact().toString())}
        </a>
      </div>
    );
  }
}
