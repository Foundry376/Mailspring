import React from 'react';
import { Utils } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CalendarView } from './calendar-constants';

export class HeaderControls extends React.Component<{
  title: string;
  nextAction: () => void;
  prevAction: () => void;
  onChangeView: (view: CalendarView) => void;
  disabledViewButton: string;
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
      <button className="btn btn-icon next" ref="onNextAction" onClick={this.props.nextAction}>
        <RetinaImg name="ic-calendar-right-arrow.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }

  _renderPrevAction() {
    if (!this.props.prevAction) {
      return false;
    }
    return (
      <button className="btn btn-icon prev" ref="onPreviousAction" onClick={this.props.prevAction}>
        <RetinaImg name="ic-calendar-left-arrow.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }

  _changeView = newView => {
    this.props.onChangeView(newView);
  };

  render() {
    return (
      <div className="header-controls">
        <div className="center-controls">
          {this._renderPrevAction()}
          <span className="title">{this.props.title}</span>
          {this._renderNextAction()}
        </div>
        <div className="view-controls">
          {[
            //{view: CalendarView.DAY, isDisabled: CalendarView.DAY === this.props.disabledViewButton,},
            {
              view: CalendarView.WEEK,
              isDisabled: CalendarView.WEEK === this.props.disabledViewButton,
            },
            {
              view: CalendarView.MONTH,
              isDisabled: CalendarView.MONTH === this.props.disabledViewButton,
            },
          ].map(buttonOptions => (
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
        {this.props.children}
      </div>
    );
  }
}
