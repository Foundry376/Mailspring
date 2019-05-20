import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Divider from '../../common/Divider';
import {
  dateFormat,
  dateFormatDigit,
  weekDayFormat,
  nearDays,
} from '../../../utils/time';
import { RetinaImg } from 'mailspring-component-kit';
import Msg from './Msg';

let key = 0;

export default class Group extends PureComponent {
  static propTypes = {
    group: PropTypes.arrayOf(
      PropTypes.shape({
        messages:
          PropTypes.shape({
            id: PropTypes.string.isRequired,
            conversationJid: PropTypes.string.isRequired,
            sender: PropTypes.string.isRequired,
            body: PropTypes.string.isRequired,
            sentTime: PropTypes.number.isRequired,
            status: PropTypes.string.isRequired,
          })
      })
    ).isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }),
  }

  render() {
    const { group } = this.props;
    return (
      <div className="message-group">
        <div className="day-label">
          <label>
            <Divider type="horizontal" />
            {nearDays(group.time) ? (
              <div className="day-label-text">
                <span className='weekday'>{dateFormat(group.time)}</span>
                <span className='date'>{dateFormatDigit(group.time)}</span>
              </div>) :
              (
                <div className="day-label-text">
                  <span className='weekday'>{weekDayFormat(group.time)}</span>
                  <span className='date'>{dateFormatDigit(group.time)}</span>
                </div>)
            }
          </label>
        </div>
        { group.messages.map((msg, idx) => ( <Msg conversation={this.props.conversation}
                 msg={msg}
                 queueLoadMessage={this.props.queueLoadMessage}
                 onMessageSubmitted={this.props.onMessageSubmitted}
                 key={msg.id}>
            </Msg>)
          )
        }
      </div>
    )
  }
}
