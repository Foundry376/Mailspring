import { PropTypes, Utils } from 'mailspring-exports';
import React from 'react';

type FlexboxProps = {
  direction?: string;
  inline?: boolean;
  style?: object;
  height?: string;
};
/*
Public: A simple wrapper that provides a Flexbox layout with the given direction and style.
Any additional props you set on the Flexbox are rendered.

Section: Component Kit
*/
export class Flexbox extends React.Component<FlexboxProps & React.HTMLProps<HTMLDivElement>> {
  static displayName = 'Flexbox';

  /*
  Public: React `props` supported by Flexbox:

   - `direction` (optional) A {String} Flexbox direction: either `column` or `row`.
   - `style` (optional) An {Object} with styles to apply to the flexbox.
  */
  static propTypes = {
    direction: PropTypes.string,
    inline: PropTypes.bool,
    style: PropTypes.object,
    height: PropTypes.string,
  };

  static defaultProps = {
    height: '100%',
    style: {},
  };

  render() {
    const style = Object.assign(
      {},
      {
        flexDirection: this.props.direction,
        position: 'relative',
        display: 'flex',
        height: this.props.height,
      },
      this.props.style
    );

    if (this.props.inline === true) {
      style.display = 'inline-flex';
    }

    const otherProps = Utils.fastOmit(this.props, Object.keys(Flexbox.propTypes));

    return (
      <div style={style} {...otherProps}>
        {this.props.children}
      </div>
    );
  }
}
