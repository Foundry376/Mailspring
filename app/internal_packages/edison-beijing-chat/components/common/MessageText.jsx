/* eslint-disable prettier/prettier */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { name } from '../../utils/name';

const AT_BEGIN_CHAR = '\u0005';
const AT_END_CHAR = '\u0004';
const AT_INDEX_BASE = 0xf000;

export default class MessageText extends Component {
  static propTypes = {
    text: PropTypes.string.isRequired,
    atJids: PropTypes.array,
  };
  constructor() {
    super();
    this.state = { pieces: [] };
  }
  getPieces = props => {
    // to indicate the at name:
    // send message will add \u0005 and \u0004 around the contact name
    const { text } = props;
    console.log('getPieces: ', text);
    const pieces = [];
    let pos = 0;
    let i = 0;
    // let jid;
    while (i < text.length) {
      if (text[i] === AT_BEGIN_CHAR) {
        pieces.push({ text: text.substring(pos, i), type: 'normal' });
        pos = i + 1;
      } else if (text[i] === AT_END_CHAR) {
        const jid = text.substring(pos + 1, i); // @jid
        console.log('getPieces: jid: ', jid);
        let atName;
        if (jid === 'all') {
          atName = 'all';
        } else {
          atName = name(jid);
        }
        atName = '@' + (atName || text.substring(pos, i));
        pieces.push({ text: atName, type: 'at' });
        pos = i + 1;
      }
      i++;
    }
    if (pos < text.length) {
      pieces.push({
        text: text.substring(pos, text.length),
        type: 'normal',
      });
    }
    return pieces;
  };
  render() {
    const pieces = this.getPieces(this.props);
    const spans = pieces.map((piece, index) => {
      return (
        <span className={piece.type} key={index}>
          {piece.text}
        </span>
      );
    });
    return <div className="msg-text-with-at">{spans}</div>;
  }
}
