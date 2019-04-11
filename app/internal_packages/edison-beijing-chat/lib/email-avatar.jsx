/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import { gradientColorForString } from '../chat-components/utils/colors';

export default class EmailAvatar extends Component {
  static displayName = 'EmailAvatar';
  constructor(props) {
    super(props);
    let from = {};
    if (props.thread) {
      const messages = props.thread.__messages;
      if (messages && messages.length) {
        from = messages[0].from[0];
      }
      from = from || {};
    } else if (props.from) {
      from = {
        name: props.from && props.from.displayName({ compact: true }),
        email: props.from.email
      }
    }

    this.state = {
      name: (from.name || from.email || ' ')
        .trim()
        .substring(0, 1)
        .toUpperCase(),
      bgColor: gradientColorForString(from.email || '')
    }
  }
  render() {
    const { name, bgColor } = this.state;
    let styles = { background: bgColor };
    if (this.props.styles) {
      styles = Object.assign(styles, this.props.styles);
    }
    return (
      <div className="avatar-icon" style={styles}>
        {name}
      </div>
    )
  }
}
