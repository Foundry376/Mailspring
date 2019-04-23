import React from 'react';
import OnboardingActions from './onboarding-actions';
import LottieImg from './lottie-img-for-tutorial';

const Steps = [
  {
    seen: false,
    id: 'tutorial-0',
    title: 'Welcome to Edison Mail!',
    image: 'tutorial-0@2x.png',
    frameRange: [0, 21],
    description:
      `Your email with an assistant built in. <br/>Better, faster, and stronger.`,
  },
  {
    seen: false,
    id: 'tutorial-1',
    title: 'Lightning Fast',
    image: 'tutorial-1@2x.png',
    frameRange: [20, 46],
    description:
      `Search results in a fraction of a second. <br/> Meet the fastest mail app on desktop.`,
  },
  {
    seen: false,
    id: 'tutorial-2',
    title: 'With an Assistant Built-In',
    image: 'tutorial-2@2x.png',
    frameRange: [45, 71],
    description:
      `Easily find travel reservations, <br/> packages, and more.`,
  },
  {
    seen: false,
    id: 'tutorial-3',
    frameRange: [70, 96],
    title: '1-Tap Unsubscribe',
    image: 'tutorial-3@2x.png',
    description:
      `Clean up your inbox in seconds by <br/> easily removing junk.`,
  },
  {
    seen: false,
    id: 'tutorial-4',
    title: 'Welcome to Edison Mail!',
    image: 'tutorial-0@2x.png',
    frameRange: [95, 121],
    description:
      `Your email with an assistant built in. <br/>Better, faster, and stronger.`,
  },
];

export default class TutorialPage extends React.Component {
  static displayName = 'TutorialPage';

  constructor(props) {
    super(props);
    this.state = {
      idx: 0
    };
  }

  _setCurrentIndex = (idx) => {
    this.setState({
      idx
    });
  }

  _onNextUnseen = () => {
    OnboardingActions.moveToPage('authenticate');
  };

  render() {
    const currentIndex = this.state.idx;
    return (
      <div className={`page tutorial`}>
        <div className="tutorial-container swiper-container">
          <div className="swiper-wrapper">
            <div className="swiper-slide">
              <LottieImg name={'mac-onboarding'}
                height={400} width={'100%'}
                style={{ width: '100%', height: 400 }}
                pagination={{
                  el: '.swiper-pagination',
                  clickable: true
                }}
                navigation={{
                  nextEl: '.swiper-button-next',
                  prevEl: '.swiper-button-prev',
                }}
                data={Steps}
                setCurrentIndex={this._setCurrentIndex}
              />
              <h2>{Steps[currentIndex].title}</h2>
              <p dangerouslySetInnerHTML={{ __html: Steps[currentIndex].description }} ></p>
            </div>
          </div>
          <div className="swiper-pagination"></div>
          <div className="swiper-button-prev">
            <span className="dt-icon-back" />
          </div>
          <div className="swiper-button-next">
            <span className="dt-icon-next" />
          </div>
        </div>
        <div className="footer">
          <button key="next" className="btn btn-large btn-next" onClick={this._onNextUnseen}>
            Start Using Email
          </button>
        </div>
      </div >
    );
  }
}
