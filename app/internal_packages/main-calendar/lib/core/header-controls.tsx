import React from 'react';
import { Utils, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CalendarView } from './calendar-constants';

export class HeaderControls extends React.Component<{
  title: string;
  nextAction: () => void;
  prevAction: () => void;
  onChangeView: (view: CalendarView) => void;
  disabledViewButton: string;
  /** Which way the previous and next arrows point: the way the view scrolls. */
  orientation?: 'horizontal' | 'vertical';
}> {
  static displayName = 'HeaderControls';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  _renderNextAction() {
    if (!this.props.nextAction) {
      return false;
    }
    return (
      <button
        className="btn btn-icon next"
        ref="onNextAction"
        aria-label={localized('Next')}
        onClick={this.props.nextAction}
      >
        <RetinaImg
          name={
            this.props.orientation === 'vertical'
              ? 'ic-calendar-down-arrow.png'
              : 'ic-calendar-right-arrow.png'
          }
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </button>
    );
  }

  _renderPrevAction() {
    if (!this.props.prevAction) {
      return false;
    }
    return (
      <button
        className="btn btn-icon prev"
        ref="onPreviousAction"
        aria-label={localized('Previous')}
        onClick={this.props.prevAction}
      >
        <RetinaImg
          name={
            this.props.orientation === 'vertical'
              ? 'ic-calendar-up-arrow.png'
              : 'ic-calendar-left-arrow.png'
          }
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      </button>
    );
  }

  _changeView = (newView: CalendarView) => {
    this.props.onChangeView(newView);
  };

  render() {
    return (
      <div className="header-controls" onClick={(e) => e.stopPropagation()}>
        <div className="side-controls">{this.props.children}</div>
        <div className="center-controls">
          {this._renderPrevAction()}
          <span className="title">{this.props.title}</span>
          {this._renderNextAction()}
        </div>
        <div className="side-controls">
          <div className="view-controls">
            {[
              {
                view: CalendarView.DAY,
                isDisabled: CalendarView.DAY === this.props.disabledViewButton,
              },
              {
                view: CalendarView.WEEK,
                isDisabled: CalendarView.WEEK === this.props.disabledViewButton,
              },
              {
                view: CalendarView.MONTH,
                isDisabled: CalendarView.MONTH === this.props.disabledViewButton,
              },
              {
                view: CalendarView.AGENDA,
                isDisabled: CalendarView.AGENDA === this.props.disabledViewButton,
              },
            ].map((buttonOptions) => (
              <button
                key={buttonOptions.view}
                className={buttonOptions.isDisabled ? 'cur-view-btn' : 'view-btn'}
                onClick={() => this._changeView(buttonOptions.view)}
                disabled={buttonOptions.isDisabled}
              >
                {buttonOptions.view}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
