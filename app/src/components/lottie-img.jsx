import { React, PropTypes, Utils } from 'mailspring-exports';
import _ from 'underscore';
import lottie from 'lottie-web';

class Lottie extends React.Component {
  componentDidMount() {
    const {
      options,
      eventListeners,
    } = this.props;

    const {
      loop,
      autoplay,
      animationData,
      rendererSettings,
      segments,
    } = options;

    this.options = {
      container: this.el,
      renderer: 'svg',
      loop: loop !== false,
      autoplay: autoplay !== false,
      segments: segments !== false,
      animationData,
      rendererSettings,
    };

    this.options = { ...this.options, ...options };

    this.anim = lottie.loadAnimation(this.options);
    this.registerEvents(eventListeners);
  }

  componentWillUpdate(nextProps /* , nextState */) {
    /* Recreate the animation handle if the data is changed */
    if (this.options.animationData !== nextProps.options.animationData) {
      this.deRegisterEvents(this.props.eventListeners);
      this.destroy();
      this.options = { ...this.options, ...nextProps.options };
      this.anim = lottie.loadAnimation(this.options);
      this.registerEvents(nextProps.eventListeners);
    }
  }

  componentDidUpdate() {
    if (this.props.isStopped) {
      this.stop();
    } else if (this.props.segments) {
      this.playSegments();
    } else {
      this.play();
    }

    this.pause();
    this.setSpeed();
    this.setDirection();
  }

  componentWillUnmount() {
    this.deRegisterEvents(this.props.eventListeners);
    this.destroy();
    this.options.animationData = null;
    this.anim = null;
  }

  setSpeed() {
    this.anim.setSpeed(this.props.speed);
  }

  setDirection() {
    this.anim.setDirection(this.props.direction);
  }

  play() {
    this.anim.play();
  }

  playSegments() {
    this.anim.playSegments(this.props.segments);
  }

  stop() {
    this.anim.stop();
  }

  pause() {
    if (this.props.isPaused && !this.anim.isPaused) {
      this.anim.pause();
    } else if (!this.props.isPaused && this.anim.isPaused) {
      this.anim.pause();
    }
  }

  destroy() {
    this.anim.destroy();
  }

  registerEvents(eventListeners) {
    eventListeners.forEach((eventListener) => {
      this.anim.addEventListener(eventListener.eventName, eventListener.callback);
    });
  }

  deRegisterEvents(eventListeners) {
    eventListeners.forEach((eventListener) => {
      this.anim.removeEventListener(eventListener.eventName, eventListener.callback);
    });
  }

  handleClickToPause = () => {
    // The pause() method is for handling pausing by passing a prop isPaused
    // This method is for handling the ability to pause by clicking on the animation
    if (this.anim.isPaused) {
      this.anim.play();
    } else {
      this.anim.pause();
    }
  }

  render() {
    const {
      width,
      height,
      ariaRole,
      ariaLabel,
      isClickToPauseDisabled,
      title,
    } = this.props;

    const getSize = (initial) => {
      let size;

      if (typeof initial === 'number') {
        size = `${initial}px`;
      } else {
        size = initial || '100%';
      }

      return size;
    };

    const lottieStyles = {
      width: getSize(width),
      height: getSize(height),
      overflow: 'hidden',
      margin: '0 auto',
      outline: 'none',
      ...this.props.style,
    };

    const onClickHandler = isClickToPauseDisabled ? () => null : this.handleClickToPause;

    return (
      // Bug with eslint rules https://github.com/airbnb/javascript/issues/1374
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        ref={(c) => {
          this.el = c;
        }}
        style={lottieStyles}
        onClick={onClickHandler}
        title={title}
        role={ariaRole}
        aria-label={ariaLabel}
        tabIndex="0"
      />
    );
  }
}

Lottie.propTypes = {
  eventListeners: PropTypes.arrayOf(PropTypes.object),
  options: PropTypes.object.isRequired,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  isStopped: PropTypes.bool,
  isPaused: PropTypes.bool,
  speed: PropTypes.number,
  segments: PropTypes.arrayOf(PropTypes.number),
  direction: PropTypes.number,
  ariaRole: PropTypes.string,
  ariaLabel: PropTypes.string,
  isClickToPauseDisabled: PropTypes.bool,
  title: PropTypes.string,
  style: PropTypes.object,
};

Lottie.defaultProps = {
  eventListeners: [],
  isStopped: false,
  isPaused: false,
  speed: 1,
  ariaRole: 'button',
  ariaLabel: 'animation',
  isClickToPauseDisabled: true,
  title: '',
};

export default class LottieImg extends React.Component {
  static displayName = 'LottieImg';

  static propTypes = {
    name: PropTypes.string.isRequired,
    size: PropTypes.shape({
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    options: PropTypes.object,
    resourcePath: PropTypes.string,
    style: PropTypes.object,
  };
  static defaultProps = {
    size: { width: 16, height: 16 },
    options: {
      loop: true,
      autoplay: true,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid slice'
      }
    },
    resourcePath: null,
    style: { margin: 'none' }
  };

  constructor(props) {
    super(props);
    this.animationData = null;
  }


  shouldComponentUpdate = nextProps => {
    return !_.isEqual(this.props, nextProps);
  };

  _pathFor = name => {
    if (!name || typeof name !== 'string') return null;
    let pathName = `${name}.json`;

    const [basename, ext] = name.split('.');
    if (this.props.active === true) {
      pathName = `${basename}-active.${ext}`;
    }
    if (this.props.selected === true) {
      pathName = `${basename}-selected.${ext}`;
    }
    return Utils.lottieNamed(pathName, this.props.resourcePath);
  };

  render() {
    const {options, ...others} = this.props;
    this.animationData = this.animationData || require(this._pathFor(this.props.name));
    options.animationData = this.animationData;
    return <Lottie {...others}
      options={options}
      height={this.props.size.height}
      width={this.props.size.width}
      style={this.props.style}/>
  }
}
