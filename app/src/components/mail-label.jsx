import React from 'react';
import PropTypes from 'prop-types';
import RetinaImg from './retina-img';
const Colr = require('colr');

export const LabelColorizer = {
  colors: [
    '#e4e3e4',
    '#aec9f1',
    '#8fd1bf',
    '#dfd3fe',
    '#ff0400',
    '#f9cddc',
    '#efa99f',
    '#bababa',
    '#427de0',
    '#2e96b0',
    '#f297a9',
    '#f74431',
    '#fec1a8',
    '#fed8ae',
    '#f9e47e',
    '#fce9bb',
    '#acebcd',
    '#9ad6b9',
    '#fd6a3a',
    '#fda248',
    '#e8d6d9',
    '#c49ca2',
    '#41ce89',
    '#209c5c',
  ],

  color(label) {
    const bgColor = LabelColorizer.colors[label.bgColor || 0];
    var colr = Colr.fromHex(bgColor).darken(30);
    return colr.toHex();
  },

  backgroundColor(label) {
    const bgColor = LabelColorizer.colors[label.bgColor || 0];
    return bgColor;
  },

  backgroundColorDark(label) {
    const bgColor = LabelColorizer.colors[label.bgColor || 0];
    var colr = Colr.fromHex(bgColor).darken(30);
    return colr.toHex();
  },

  styles(label) {
    const bgColor = LabelColorizer.colors[label.bgColor || 0];
    var colr = Colr.fromHex(bgColor).darken(15);
    const styles = {
      color: LabelColorizer.color(label),
      backgroundColor: LabelColorizer.backgroundColor(label),
      boxShadow: `inset 0 0 1px ${colr.toHex()}, inset 0 1px 1px rgba(255,255,255,0.5), 0 0.5px 0 rgba(255,255,255,0.5)`,
    };
    if (process.platform !== 'win32') {
      styles.backgroundImage = 'linear-gradient(rgba(255,255,255, 0.4), rgba(255,255,255,0))';
    }
    return styles;
  },
};

export class MailLabel extends React.Component {
  static propTypes = {
    label: PropTypes.object.isRequired,
    onRemove: PropTypes.func,
  };

  shouldComponentUpdate(nextProps) {
    if (nextProps.label.id === this.props.label.id) {
      return false;
    }
    return true;
  }

  _removable() {
    return this.props.onRemove && !this.props.label.isLockedCategory();
  }

  render() {
    let classname = 'mail-label';
    let content = this.props.label.displayName;

    let x = null;
    if (this._removable()) {
      classname += ' removable';
      content = <span className="inner">{content}</span>;
      x = (
        <RetinaImg
          className="x"
          isIcon
          name="close_1.svg"
          style={{ width: 10, backgroundColor: LabelColorizer.color(this.props.label) }}
          mode={RetinaImg.Mode.ContentIsMask}
          onClick={this.props.onRemove}
        />
      );
    }

    return (
      <div className={classname} style={LabelColorizer.styles(this.props.label)}>
        {content}
        {x}
      </div>
    );
  }
}
