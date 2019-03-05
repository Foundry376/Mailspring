import React, { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { PropTypes } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { Menu, MenuProps } from './menu';

const Attachment = {
  LeftEdge: 'LeftEdge',
  RightEdge: 'RightEdge',
};

interface DropdownMenuProps extends MenuProps {
  className?: string;
  intitialSelectionItem?: object;
  attachment?: string;
  headerComponents?: React.ReactNode;
}
type DropdownMenuState = {
  expanded: boolean;
  currentSelection: any;
};

export default class DropdownMenu extends React.Component<DropdownMenuProps, DropdownMenuState> {
  static Attachment = Attachment;

  constructor(props) {
    super(props);
    this.state = {
      expanded: false,
      currentSelection: this.props.intitialSelectionItem,
    };
  }

  componentWillReceiveProps(nextProps) {
    this.setState({ currentSelection: nextProps.intitialSelectionItem });
  }

  _toggleExpanded = () => {
    this.setState({ expanded: !this.state.expanded }, () => {
      if (this.state.expanded) {
        const searchInput = (ReactDOM.findDOMNode(this) as HTMLElement).querySelector('input');
        if (searchInput) {
          searchInput.focus();
        }
      }
    });
  };

  _close = () => {
    if (this.state.expanded) {
      this.setState({ expanded: false });
    }
  };

  _onSelect = item => {
    this.setState({ currentSelection: item });
    if (this.props.onSelect) {
      this.props.onSelect(item);
    }
    this._close();
  };

  _onBlur = e => {
    const node = ReactDOM.findDOMNode(this);
    let otherNode = e.relatedTarget;
    if (otherNode) {
      while (otherNode.parentElement) {
        // Don't close the dropdown if the related target is a child of this component
        if (otherNode.parentElement === node) {
          return;
        }
        otherNode = otherNode.parentElement;
      }
    }
    this._close();
  };

  render() {
    let dropdown: React.ReactElement = <span />;
    if (this.state.expanded) {
      dropdown = <Menu {...this.props} onEscape={this._close} onSelect={this._onSelect} />;
    }

    let dropdownContainerStyles: CSSProperties = { position: 'absolute', left: 0, zIndex: 10 };
    if (this.props.attachment === Attachment.RightEdge) {
      dropdownContainerStyles = { position: 'absolute', right: 0, zIndex: 10 };
    }

    return (
      <div
        className={`btn dropdown-menu ${this.props.className}`}
        tabIndex={-1}
        onBlur={this._onBlur}
        style={{ display: 'inline-block', position: 'relative' }}
      >
        <div
          onClick={this._toggleExpanded}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {this.props.itemContent(this.state.currentSelection)}
          <RetinaImg
            style={{ marginLeft: 5 }}
            name="dropdown-chevron.png"
            mode={RetinaImg.Mode.ContentDark}
          />
        </div>
        <div style={dropdownContainerStyles}>{dropdown}</div>
      </div>
    );
  }
}
