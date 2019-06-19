import React, { PureComponent } from 'react';
import _ from 'lodash';
import PropTypes from 'prop-types';
import Divider from '../../common/Divider';
import {
  dateFormat,
  dateFormatDigit,
  weekDayFormat,
  nearDays,
} from '../../../../utils/time';
import Msg from './Msg';

export default class Group extends PureComponent {
  static propTypes = {
    group:
      PropTypes.shape({
        messages: PropTypes.arrayOf(PropTypes.shape({
          id: PropTypes.string.isRequired,
          conversationJid: PropTypes.string.isRequired,
          sender: PropTypes.string.isRequired,
          body: PropTypes.string.isRequired,
          sentTime: PropTypes.number.isRequired,
          status: PropTypes.string.isRequired,
        }))
      }).isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }),
    shouldDisplayMessageCounts: PropTypes.number
  }

  render() {
    const { group, shouldDisplayMessageCounts } = this.props;
    group.messages = _.uniqBy(group.messages, msg => msg.dataValues.body + Math.floor(msg.sentTime/100000))
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
        {group.messages.map(msg => {
          return msg.rowNum <= shouldDisplayMessageCounts && (
            <Msg
              conversation={this.props.conversation}
              msg={msg}
              queueLoadMessage={this.props.queueLoadMessage}
              onMessageSubmitted={this.props.onMessageSubmitted}
              getContactInfoByJid={this.props.getContactInfoByJid}
              key={msg.id}>
            </Msg>
          )
        })
        }
      </div>
    )
  }
}
