import React from 'react';
import OnboardingActions from './onboarding-actions';
import Swiper from 'swiper';

const Steps = [
  {
    seen: false,
    id: 'tutorial-1',
    title: 'Lightning Fast',
    image: 'tutorial-1@2x.png',
    description:
      `Search results in a fraction of a second. <br/> Meet the fastest mail app on desktop.`,
  },
  {
    seen: false,
    id: 'tutorial-2',
    title: 'With an Assistant Built-In',
    image: 'tutorial-2@2x.png',
    description:
      `Easily find travel reservations, <br/> packages, and more.`,
  },
  {
    seen: false,
    id: 'tutorial-3',
    title: '1-Tap Unsubscribe',
    image: 'tutorial-3@2x.png',
    description:
      `Clean up your inbox in seconds by <br/> easily removing junk.`,
  },
];

export default class TutorialPage extends React.Component {
  static displayName = 'TutorialPage';

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    new Swiper('.swiper-container', {
      autoplay: {
        delay: 8000,
      },
      pagination: {
        el: '.swiper-pagination',
      },
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
    });
  }

  _onNextUnseen = () => {
    OnboardingActions.moveToPage('authenticate');
  };

  render() {

    return (
      <div className={`page tutorial`}>
        <div className="tutorial-container swiper-container">
          <div className="swiper-wrapper">
            {Steps.map(step => (
              <div className="swiper-slide" key={step.id}>
                <img
                  src={`edisonmail://onboarding/assets/${step.image}`}
                  alt=""
                />
                <h2>{step.title}</h2>
                <p dangerouslySetInnerHTML={{ __html: step.description }} ></p>
              </div>
            ))}
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
