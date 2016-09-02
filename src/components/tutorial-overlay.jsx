import React from 'react';

const width = 300;
const arrowWidth = 20;
const arrowOffset = 15; // only applies when the arrow isn't center aligned (offset from side)

export default class TutorialOverlay extends React.Component {

  componentDidMount() {
    window.addEventListener("resize", this.updateDimensions);
    this._getTarget().addEventListener("resize",
      this.updateDimensions);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.updateDimensions);
    this._getTarget().removeEventListener("resize",
      this.updateDimensions);
  }

  // Calculate the dimensions needed to properly style the overlay elements
  getNewDimensions() {
    const target = this._getTarget();
    const body = document.body;
    if (target && body) {
      const bounds = target.getBoundingClientRect();
      // Cap the bounds height/width at the height/width of the body, which should be
      // the size of the viewport.
      const boundsHeight = Math.min(body.offsetHeight, bounds.height);
      const boundsWidth = Math.min(body.offsetWidth, bounds.width);

      // The "hole" effect in the overlay is made by creating the gray part with
      // borders, so that the inner part of the div is still transparent.
      // Calculate the border widths such that the hole is over the target element.
      const dims = {
        border_top_width: bounds.top,
        border_left_width: bounds.left,
      }
      dims.border_right_width = body.offsetWidth - boundsWidth - dims.border_left_width;
      dims.border_bottom_width = body.offsetHeight - boundsHeight - dims.border_top_width;

      dims.className = '';

      if (this.props.fromSide) { // defaults from left side, unless there's not enough room
        // we don't know what the height of the TutorialOverlay will be, so arbitrarily
        // position it 1/4 of the way down the target element.
        dims.top = bounds.top + (boundsHeight / 4);
        dims.bottom = 'auto'
        const margin = 15;
        if (bounds.left < width + 2 * margin) { // not enought room, put on right side
          dims.left = bounds.left + boundsWidth + margin;
          dims.className += ' left-pointing';
        } else { // put on left side
          dims.left = bounds.left - width - margin;
          dims.className += ' right-pointing';
        }
      } else { // Not fromSide, default below the target element
        // Calculate where the arrow should be horizontally aligned
        const targetCenter = bounds.left + (boundsWidth / 2); // center of the target
        const overlayLeft = targetCenter - width / 2; // left value of overlay if arrow were centered
        if (overlayLeft < 0) {
          // The target is too far left, left-align the arrow
          dims.className += ' left-aligned';
          dims.left = overlayLeft + (width - arrowWidth) / 2 - arrowOffset;
        } else if (overlayLeft + width > body.offsetWidth) {
          // the target is too far right, right-align the arrow
          dims.className += ' right-aligned';
          dims.left = overlayLeft - (width - arrowWidth) / 2 + arrowOffset;
        } else {
          // keep it cenetered
          dims.className += ' center-aligned';
          dims.left = overlayLeft;
        }

        // Use an arbitrary height to try to guess if there is enough room for the
        // overlay below the target element. Typically, the ones that need an overlay
        // above instead of below actually have a very small border_bottom_width.
        if (dims.border_bottom_width > 300) {
          dims.className += ' top-arrow';
          dims.top = bounds.bottom + 20;
          dims.bottom = 'auto';
        } else {
          dims.className += ' bottom-arrow';
          dims.bottom = body.offsetHeight - bounds.bottom + 40;
          dims.top = 'auto';
        }
      }
      return dims;
    }
    return null;
  }

  // This sets the state, even though we don't use the data from the state,
  // to make sure the component is updated. (This is only called on resizes.)
  updateDimensions = () => {
    this.setState(this.getNewDimensions());
  }

  // Returns the target element based on this.props.targetIdentifier
  // this.props.targetIdentifier can be:
  //   - a normal selector string, this.props.useGenericSelector must be true
  //   - the string value of a data-tutorial-id attribute, this.props.useGenericSelector must be false
  //   - an instance of HTMLElement, this.props.useGenericSelector is ignored
  _getTarget() {
    if (typeof(this.props.targetIdentifier) === 'string') {
      if (this.props.useGenericSelector) {
        return document.querySelector(this.props.targetIdentifier);
      }
      return document.querySelector(`[data-tutorial-id='${this.props.targetIdentifier}']`)
    }
    if (this.props.targetIdentifier instanceof HTMLElement) {
      return this.props.targetIdentifier;
    }
    throw new Error("Could not parse this.props.targetIdentifier")
  }

  render() {
    // Calculate new dims instead of using the state because the state isn't
    // always up-to-date.
    const dims = this.getNewDimensions();
    return (
      <div>
        <div
          className="tutorial-gray-layer"
          style={{
            borderTopWidth: dims.border_top_width,
            borderRightWidth: dims.border_right_width,
            borderBottomWidth: dims.border_bottom_width,
            borderLeftWidth: dims.border_left_width,
          }}
        ></div>
        <div
          className={`tutorial-overlay ${dims.className}`}
          style={{left: dims.left, top: dims.top, bottom: dims.bottom}}
        >
          <div className="tutorial-title">{this.props.title}</div>
          {this.props.children}
        </div>
      </div>
    )
  }
}

TutorialOverlay.propTypes = {
  title: React.PropTypes.string,
  targetIdentifier: React.PropTypes.node,
  useGenericSelector: React.PropTypes.bool,
  fromSide: React.PropTypes.bool,
  circularSpotlight: React.PropTypes.bool,
}
