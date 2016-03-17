import React, {Component, PropTypes} from 'react';
import {DraftStore, Utils, DateUtils} from 'nylas-exports';
import {RetinaImg} from 'nylas-component-kit'
import _ from 'underscore'
import moment from 'moment'

export default class EventInviteContainer extends Component {
  static displayName = 'EventInviteContainer';

  static propTypes = {
    draftClientId: PropTypes.string,
    threadId: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {events: []};
    this._session = null;
    this._mounted = false;
    this._unsubscribes = [];
  }

  componentDidMount() {
    this._mounted = true;
    // TODO what if it gets new props??
    DraftStore.sessionForClientId(this.props.draftClientId).then(session => {
      // Only run if things are still relevant: component is mounted
      // and draftClientIds still match
      if (this._mounted && this.props.draftClientId === session.draftClientId) {
        this._session = session;
        const unsub = session.listen( () => { this._onDraftChange(); });
        this._unsubscribes.push(unsub);
        this._onDraftChange();
      }
    });

    // Add native event listeners to immediately stop
    const node = React.findDOMNode(this.refs.event_invite_container);
    node.addEventListener("mousedown", e => e.stopPropagation());
    node.addEventListener("mouseup", e => e.stopPropagation());
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unsubscribes.forEach(s => s());
  }

  _onDraftChange() {
    const draft = this._session.draft();
    this.setState({events: [].concat(draft.events || [])});
  }

  _onEventChange(change, index) {
    const events = this.state.events;
    const event = events[index].clone();
    _.extend(event, change);
    events.splice(index, 1, event);
    console.log(events[0].start);
    this._session.changes.add({events}); //triggers draft change
  }

  _renderEventEditor(event, index) {
    return (<EventInvite event={event}
                         draft={this._session.draft()}
                         onChange={change => this._onEventChange(change, index)} />)
  }

  render() {
    return (<div className="event-invite-container"
                 ref="event_invite_container">
      {this.state.events.map((evt, i) => this._renderEventEditor(evt, i))}
    </div>)
  }
}


function getDateFormat(type) {
  switch (type) {
  case "date": return "YYYY-MM-DD";
  case "time": return "HH:mm:ss";
  }
}


class EventInvite extends Component {
  static displayName = 'EventInvite';

  static propTypes = {
    event: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      expanded: false,
    };
  }

  _renderExpanded() {
    return (
      <div className="row description">
        <RetinaImg name="ic-eventcard-notes@2x.png" mode={RetinaImg.Mode.ContentIsMask} />

        <input type="text"
               name="description"
               placeholder="Add notes"
               value={this.props.event.description || this.props.draft.body}
               onChange={ e => this.props.onChange({description: e.target.value}) }/>
      </div>
      /*
      <div className="row link">
      <RetinaImg name="ic-eventcard-link@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
      <EventTextBox value={this.props.event.link}
      onChange={ text => this.props.onChange({link: text}) } />
      </div>
      <div className="row reminder">
      <RetinaImg name="ic-eventcard-reminder@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
      <ReminderContainer value={this.props.event.reminders}
      onChange={ reminders => this.props.onChange({reminders: reminders}) } />
      </div>
      */
    )
  }

  _onDateChange(field, date, time) {
    const change = {};
    change[field] = moment.tz(`${date} ${time}`, `${getDateFormat("date")} ${getDateFormat("time")}`, Utils.timeZone).unix();
    this.props.onChange(change)
  }

  _renderCollapsed() {
    return (<div className="row expand" onClick={()=>{this.setState({expanded: true})}}>
      <RetinaImg name="ic-eventcard-link@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
      Add reminders, notes, links...
    </div>)
  }

  render() {
    return (<div className="event-invite">
      <div className="row title">
        <RetinaImg name="ic-eventcard-description@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <input type="text"
               name="title"
               placeholder="Add an event title"
               value={this.props.event.title || this.props.draft.subject}
               onChange={e => this.props.onChange({title: e.target.value}) }/>
      </div>

      <div className="row time">
        <RetinaImg name="ic-eventcard-time@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span>
          <EventDatetimeInput name="start-date" type="date"
                              ref="startdate"
                              value={this.props.event.start}
                              onChange={ datestr => {
                                this._startDateStr = datestr;
                                this._onDateChange("start", datestr, this._startTimeStr)
                              }} />
          at
          <EventDatetimeInput name="start-time" type="time"
                              ref="starttime"
                            value={this.props.event.start}
                            onChange={ timestr => {
                            this._startTimeStr = timestr;
                            this._onDateChange("start", this._startDateStr, timestr)} } />
          -
          <EventDatetimeInput name="end-time" type="time"
                            value={this.props.event.end}
                            onChange={ date => this.props.onChange({end: date}) } />
          on
          <EventDatetimeInput name="end-date" type="date"
                            value={this.props.event.end}
                            onChange={ date => this.props.onChange({end: date}) } />
          {moment().tz(Utils.timeZone).format("z")}
        </span>
      </div>

      <div className="row recipients">
        <RetinaImg name="ic-eventcard-people@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <div>{(this.props.event.participants || []).map(r => r.name).join(", ")}</div>
      </div>

      <div className="row location">
        <RetinaImg name="ic-eventcard-location@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <input type="text"
               name="location"
               placeholder="Add a location"
               value={this.props.event.location}
               onChange={e => this.props.onChange({location: e.target.value}) }/>
      </div>

      {this.state.expanded ? this._renderExpanded() : this._renderCollapsed()}
    </div>)
  }
}

class EventDatetimeInput extends Component {
  static displayName = "EventDatetimeInput";

  static propTypes = {
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
    type: PropTypes.string.isRequired,
    name: PropTypes.string,
  };

  _formatDate(date) {
    if (date == null) {return null;}
    return moment.unix(date).tz(Utils.timeZone).format(getDateFormat(this.props.type));
  }

  render() {
    return (<input type={this.props.type}
                   name={this.props.name}
                   value={this._formatDate(this.props.value)}
                   onChange={e => {this.props.onChange(e.target.value)}}/>)
  }
}