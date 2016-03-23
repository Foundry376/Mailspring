import React, {Component, PropTypes} from 'react';
import {Utils, DatabaseStore, Calendar} from 'nylas-exports';
import {RetinaImg} from 'nylas-component-kit'
import moment from 'moment'


function getDateFormat(type) {
  switch (type) {
  case "date": return "YYYY-MM-DD";
  case "time": return "HH:mm:ss";
  default: return null;
  }
}


export default class EventInvite extends Component {
  static displayName = 'EventInvite';

  static propTypes = {
    event: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    onParticipantsClick: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this._mounted = false;
    this.state = {
      expanded: false,
      calendars: [],
    };
  }

  componentDidMount() {
    this._mounted = true;
    this.setStateFromProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setStateFromProps(newProps);
  }

  setStateFromProps(props) {
    // TODO this may not be triggered if the From: address is changed, but we need to change which
    //      calendars are displayed
    DatabaseStore.findAll(Calendar, {
      accountId: props.draft.accountId,
    }).then( calendars => {
      if (this._mounted) {
        this.setState({calendars: calendars && calendars.filter(c => !c.readOnly)})
      }
    });
  }

  _renderIcon(name) {
    return (<span className="field-icon">
      <RetinaImg name={name} mode={RetinaImg.Mode.ContentPreserve} />
    </span>)
  }

  _renderParticipants() {
    const to = this.props.draft.to || [];
    const from = this.props.draft.from || [];
    return to.concat(from).map(r => r.name).join(", ")
  }

  _renderExpanded() {
    let description = this.props.event.description;
    if (description == null) {
      description = this.props.draft.body;
    }

    return (
      <span>
        <div className="row description">
          {this._renderIcon("ic-eventcard-notes@2x.png")}

          <input type="text"
                 name="description"
                 placeholder="Add notes"
                 value={description}
                 onChange={ e => this.props.onChange({description: e.target.value}) }/>
        </div>
        <div className="row link">
          {this._renderIcon("ic-eventcard-link@2x.png")}
          <input type="text"
                 name="description"
                 placeholder="Add links"
                 value={this.props.event.link}
                 onChange={ e => this.props.onChange({link: e.target.value}) }/>
        </div>
        <div className="row reminder">
          {this._renderIcon("ic-eventcard-reminder@2x.png")}

          <input type="text"
                 name="description"
                 placeholder="Add reminders"
                 value={this.props.event.reminders}
                 onChange={ e => this.props.onChange({reminders: e.target.value}) }/>
        </div>
      </span>
)
  }

  _renderCollapsed() {
    return (<div className="row expand" onClick={()=>{this.setState({expanded: true})}}>
      {this._renderIcon("ic-eventcard-disclosure@2x.png")}
      Add reminders, notes, links...
    </div>)
  }

  _renderCalendars() {
    return this.state.calendars.map(cal =>
      <option value={cal.serverId}>{cal.name}</option>
    );
  }

  render() {
    let title = this.props.event.title;
    if (title == null) {
      title = this.props.draft.subject;
    }

    return (<div className="event-invite">
      <div className="remove-button" onClick={()=>this.props.onRemove()}>✕</div>
      <div className="row title">
        {this._renderIcon("ic-eventcard-description@2x.png")}
        <input type="text"
               name="title"
               placeholder="Add an event title"
               value={title}
               onChange={e => this.props.onChange({title: e.target.value}) }/>
      </div>

      <div className="row time">
        {this._renderIcon("ic-eventcard-time@2x.png")}
        <span>
          <EventDatetimeInput name="start"
                              value={this.props.event.start}
                              onChange={ date => this.props.onChange({start: date}) } />
          -
          <EventDatetimeInput name="end"
                              reversed
                              value={this.props.event.end}
                              onChange={ date => this.props.onChange({end: date}) } />
          <span className="timezone">{moment().tz(Utils.timeZone).format("z")}</span>
        </span>
      </div>

      <div className="row calendar">
        {this._renderIcon("ic-eventcard-calendar@2x.png")}
        <select onChange={e => {this.props.onChange({calendarId: e.target.value})} }>{this._renderCalendars()}</select>
      </div>

      <div className="row recipients">
        {this._renderIcon("ic-eventcard-people@2x.png")}
        <div onClick={this.props.onParticipantsClick()}>{this._renderParticipants()}</div>
      </div>

      <div className="row location">
        {this._renderIcon("ic-eventcard-location@2x.png")}
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
    reversed: PropTypes.bool,
    name: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this._datePartStrings = {time: "", date: ""};
  }

  /*
  componentDidMount() {
    const dateInputNode = React.findDOMNode(this.refs.date);
    dateInputNode.addEventListener("mousedown", () => {
      dateInputNode.querySelector("::-webkit-calendar-picker-indicator")
    });
  }
  */

  _onDateChange() {
    const {date, time} = this._datePartStrings;
    const format = `${getDateFormat("date")} ${getDateFormat("time")}`;
    const newDate = moment.tz(`${date} ${time}`, format, Utils.timeZone).unix();
    this.props.onChange(newDate)
  }

  _renderInput(type) {
    const unixDate = this.props.value;
    this._datePartStrings[type] = unixDate != null ? moment.unix(unixDate).tz(Utils.timeZone).format(getDateFormat(type)) : null;
    return (<input type={type}
                   ref={type}
                   name={`${this.props.name}-${type}`}
                   value={this._datePartStrings[type]}
                   onChange={e => {
                     this._datePartStrings[type] = e.target.value;
                     this._onDateChange()
                   }} />)
  }

  render() {
    if (this.props.reversed) {
      return <span className="datetime-input-container">{this._renderInput("time")} on {this._renderInput("date")}</span>;
    }
    return <span className="datetime-input-container">{this._renderInput("date")} at {this._renderInput("time")}</span>;
  }
}
