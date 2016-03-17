import {DraftStore, React, Event} from 'nylas-exports'
import {RetinaImg} from 'nylas-component-kit'

export default class EventInviteButton extends React.Component {
  static displayName = "EventInviteButton";

  static propTypes = {
    draftClientId: React.PropTypes.string,
  };

  _onClick() {
    DraftStore.sessionForClientId(this.props.draftClientId).then(session => {
      if (this.props.draftClientId === session.draftClientId) {
        const events = [].concat(session.draft().events);
        events.push(new Event());
        session.changes.add({events});
      }
    });
  }

  render() {
    return (<button className="btn btn-toolbar"
                   onClick={this._onClick.bind(this)}
                   title="Add an event…">
      <RetinaImg url="nylas://quick-schedule/assets/icon-composer-quickschedule@2x.png"
                 mode={RetinaImg.Mode.ContentIsMask} />
    </button>)
  }
}