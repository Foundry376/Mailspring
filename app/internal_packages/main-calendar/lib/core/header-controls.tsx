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
  view: CalendarView;
  nextAction: () => void;
  prevAction: () => void;
  todayAction: () => void;
  onChangeView: (view: CalendarView) => void;
  agendaOpen: boolean;
  onToggleAgenda: () => void;
  arrows?: 'horizontal' | 'vertical';
  children?: React.ReactNode;
}> {
  static displayName = 'HeaderControls';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  _renderArrow(direction: 'prev' | 'next') {
    const image = ARROW_IMAGES[this.props.arrows ?? 'horizontal'][direction];
    return (
      <button
        className={`btn-bare ${direction}`}
        aria-label={direction === 'prev' ? localized('Previous') : localized('Next')}
        onClick={direction === 'prev' ? this.props.prevAction : this.props.nextAction}
      >
        <RetinaImg
          name={image}
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 14, height: 14, WebkitMaskSize: 'contain', WebkitMaskPosition: 'center' }}
          aria-hidden="true"
        />
      </button>
    );
  }

  render() {
    return (
      <div className="header-controls">
        <div className="side-controls">
          <button className="btn btn-toolbar" onClick={this.props.todayAction}>
            {localized('Today')}
          </button>
          <div className="view-select">
            <select
              className="btn btn-toolbar"
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
              style={{ width: 8, height: 5, right: 12, WebkitMaskSize: 'contain' }}
              aria-hidden="true"
            />
          </div>
          <div className="nav-arrows">
            {this._renderArrow('prev')}
            {this._renderArrow('next')}
          </div>
          {this.props.children}
          <button
            className="btn-ghost agenda-toggle"
            aria-label={localized('Agenda')}
            aria-pressed={this.props.agendaOpen}
            title={localized('Agenda')}
            onClick={this.props.onToggleAgenda}
          >
            <RetinaImg
              name="toolbar-sidebar-right.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    );
  }
}
