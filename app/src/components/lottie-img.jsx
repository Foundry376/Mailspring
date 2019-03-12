import { React, PropTypes, Utils} from 'mailspring-exports';
import Lottie from 'react-lottie';
import _ from 'underscore';

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
    size: {width: 16, height: 16},
    options: {
      loop: true,
      autoplay: true,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid slice'
      }
    },
    resourcePath: null,
    style: {margin: 'none'}
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
    const options = this.props.options;
    this.animationData = this.animationData || require(this._pathFor(this.props.name));
    options.animationData = this.animationData;
    return <Lottie options={options}
            height={this.props.size.height}
            width={this.props.size.width}
    style={this.props.style}/>
  }
}
