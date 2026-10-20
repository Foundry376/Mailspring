import React from 'react';
import { Utils, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CalendarView } from './calendar-constants';

const VIEW_LABELS: { [view in CalendarView]: string } = {
  [CalendarView.DAY]: localized('Day'),
  [CalendarView.WEEK]: localized('Week'),
  [CalendarView.MONTH]: localized('Month'),
};

const ARROW_IMAGES = {
  horizontal: { prev: 'ic-calendar-left-arrow.png', next: 'ic-calendar-right-arrow.png' },
  vertical: { prev: 'ic-calendar-up-arrow.png', next: 'ic-calendar-down-arrow.png' },
};

export class HeaderControls extends React.Component<{
  title: string;
  view: CalendarView;
  nextAction: () => void;
  prevAction: () => void;
  todayAction: () => void;
  onChangeView: (view: CalendarView) => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
  arrows?: 'horizontal' | 'vertical';
}> {
  static displayName = 'HeaderControls';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  _renderArrow(direction: 'prev' | 'next') {
    const image = ARROW_IMAGES[this.props.arrows ?? 'horizontal'][direction];
    return (
      <button
        className={`btn btn-icon ${direction}`}
        aria-label={direction === 'prev' ? localized('Previous') : localized('Next')}
        onClick={direction === 'prev' ? this.props.prevAction : this.props.nextAction}
      >
        <RetinaImg name={image} mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
      </button>
    );
  }

  render() {
    return (
      <div className="header-controls" onClick={(e) => e.stopPropagation()}>
        <span className="title">{this.props.title}</span>
        <div className="side-controls">
          <button className="btn" onClick={this.props.todayAction}>
            {localized('Today')}
          </button>
          <div className="view-select">
            <select
              className="btn"
              aria-label={localized('View')}
              value={this.props.view}
              onChange={(e) => this.props.onChangeView(e.target.value as CalendarView)}
            >
              {Object.values(CalendarView).map((view) => (
                <option key={view} value={view}>
                  {VIEW_LABELS[view]}
                </option>
              ))}
            </select>
            <RetinaImg
              name="ic-calendar-down-arrow.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </div>
          <div className="nav-arrows">
            {this._renderArrow('prev')}
            {this._renderArrow('next')}
          </div>
          <button
            className={`btn btn-icon agenda-toggle${this.props.agendaOpen ? ' active' : ''}`}
            aria-label={localized('Agenda')}
            aria-pressed={this.props.agendaOpen}
            title={localized('Agenda')}
            onClick={this.props.onToggleAgenda}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" />
              <path d="M14.5 5v14" stroke="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    );
  }
}
