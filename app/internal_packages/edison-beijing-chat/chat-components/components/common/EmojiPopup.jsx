import React, { PureComponent } from 'react';
import { Actions } from 'mailspring-exports';
import {Flexbox, ScrollRegion, EmojiToolbarPopover } from 'mailspring-component-kit';
import PropTypes from 'prop-types';

const emojiData = require('node-emoji/lib/emoji.json');

export default class EmojiPopup extends PureComponent {
  static propTypes = {
    onEmojiSelected: PropTypes.func,
    // numsPerRow: PropTypes.number,
  };
  static defaultProps = {
    onEmojiSelected: null,
    // numsPerRow: 7
  };
  onCellSelect = (value)=>{
    if(this.props.onEmojiSelected){
      this.props.onEmojiSelected(emojiData[value]);
    }
  }
  // renderEmojis = () => {
  //   let ret = [];
  //   let values = Object.values(emojiData);
  //   let i = 0;
  //   while (i < values.length) {
  //     let tmp = [];
  //     for (let k = 0; k < this.props.numsPerRow; k++){
  //       tmp.push(<div key={i+"."+k} className='emoji-cell' onClick={this.onCellSelect.bind(this, values[i])}>{values[i]}</div>);
  //       i++;
  //     }
  //     ret.push(<div key={i} className='emoji-row'>{tmp}</div>);
  //   }
  //   return ret;
  // }


  render() {
    return <EmojiToolbarPopover onInsertEmoji={this.onCellSelect}/>;
  }
}