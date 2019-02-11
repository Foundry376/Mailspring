/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import { gradientColorForString } from '../chat-components/utils/colors';

export default class EmailAvatar extends Component {
  static displayName = 'EmailAvatar';
  constructor(props) {
    super(props);
    let from = {};
    const messages = props.thread.__messages;
    if (messages && messages.length) {
      from = messages[0].from[0];
    }
    this.state = {
      name: (from.name || from.email || ' ').substring(0, 1).toUpperCase(),
      bgColor: gradientColorForString(from.email || '')
    }
  }
  render() {
    const { name, bgColor } = this.state;
    return (
      <div className="avatar-icon" style={{ background: bgColor }}>
        {name}
      </div>
    )
  }
}
