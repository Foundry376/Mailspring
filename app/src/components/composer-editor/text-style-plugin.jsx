import React from 'react';
import { RichUtils } from 'draft-js';
import { CompactPicker } from 'react-color';

export const COLOR_STYLE_PREFIX = 'color-';
export const FONTSIZE_STYLE_PREFIX = 'font-';

const styleMap = {
  CODE: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    fontFamily: 'monospace',
    padding: 2,
  },
};

// TOOLBAR UI

function _getColor(props) {
  const currentStyle = props.editorState.getCurrentInlineStyle();
  return styleValueForGroup(currentStyle, COLOR_STYLE_PREFIX) || '#000';
}

class ToolbarColorPicker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      expanded: false,
    };
  }

  _onToggleExpanded = () => {
    this.setState({ expanded: !this.state.expanded });
  };

  _onBlur = e => {
    if (!this._el.contains(e.relatedTarget)) {
      this.setState({ expanded: false });
    }
  };

  _onChangeComplete = ({ hex }) => {
    const { onChange, onFocusComposer, editorState } = this.props;

    onFocusComposer();
    window.requestAnimationFrame(() => {
      onChange(editorStateSettingTextStyle(editorState, COLOR_STYLE_PREFIX, hex));
    });
    this.setState({ expanded: false });
  };

  shouldComponentUpdate(nProps, nState) {
    return _getColor(nProps) !== _getColor(this.props) || nState.expanded !== this.state.expanded;
  }

  render() {
    const color = _getColor(this.props);
    const { expanded } = this.state;

    return (
      <div
        tabIndex="-1"
        onBlur={this._onBlur}
        ref={el => (this._el = el)}
        style={{ display: 'inline-block', position: 'relative' }}
      >
        <button
          onClick={this._onToggleExpanded}
          style={{
            cursor: 'pointer',
            width: 20,
            height: 14,
            backgroundColor: color,
            marginRight: 8,
            marginLeft: 4,
            marginBottom: 2,
            verticalAlign: 'middle',
          }}
        />
        {expanded && (
          <div className="dropdown">
            <CompactPicker color={color} onChangeComplete={this._onChangeComplete} />
          </div>
        )}
      </div>
    );
  }
}

function _getFontSize(props) {
  const currentStyle = props.editorState.getCurrentInlineStyle();
  return styleValueForGroup(currentStyle, FONTSIZE_STYLE_PREFIX) || '14px';
}

class ToolbarFontPicker extends React.Component {
  _onSetFontSize = e => {
    const { onChange, onFocusComposer, editorState } = this.props;
    const value = e.target.value;
    onFocusComposer();
    window.requestAnimationFrame(() => {
      onChange(editorStateSettingTextStyle(editorState, FONTSIZE_STYLE_PREFIX, value));
    });
  };

  shouldComponentUpdate(nextProps) {
    return _getFontSize(nextProps) !== _getFontSize(this.props);
  }

  render() {
    const fontSize = _getFontSize(this.props);

    return (
      <button style={{ padding: 0 }}>
        <i className="fa fa-text-height" />
        <select value={fontSize} onChange={this._onSetFontSize}>
          {['10px', '12px', '14px', '16px', '18px', '22px'].map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </button>
    );
  }
}

// DRAFTJS BEHAVIORS

export function editorStateSettingTextStyle(editorState, groupPrefix, groupValue) {
  // TODO: Get all inine styles in selected area, not just at insertion point
  const currentStyle = editorState.getCurrentInlineStyle();
  const currentGroupKeys = currentStyle.filter(value => value.startsWith(groupPrefix));
  const nextGroupKey = groupValue ? `${groupPrefix}${groupValue}` : null;

  let nextEditorState = editorState;

  if (currentGroupKeys.count() !== 1 || currentGroupKeys[0] !== nextGroupKey) {
    for (const key of currentGroupKeys) {
      nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, key);
    }
  }
  if (nextGroupKey) {
    nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, nextGroupKey);
  }
  return nextEditorState;
}

export function styleValueForGroup(editorInlineStyle, group) {
  const match =
    typeof editorInlineStyle === 'string'
      ? editorInlineStyle.startsWith(group) ? editorInlineStyle : null
      : editorInlineStyle.filter(value => value.startsWith(group)).first();

  if (!match) {
    return null;
  }
  return match.split(group).pop();
}

function customStyleFn(style) {
  let styles = {};

  // apply basic styles from the map above
  for (const key of Object.keys(styleMap)) {
    if (typeof style === 'string' ? style === key : style.has(key)) {
      styles = Object.assign(styles, styleMap[key]);
    }
  }

  // apply custom styles where data is encoded in the key
  const color = styleValueForGroup(style, COLOR_STYLE_PREFIX);
  if (color) {
    styles.color = color;
  }
  const fontSize = styleValueForGroup(style, FONTSIZE_STYLE_PREFIX);
  if (fontSize) {
    styles.fontSize = fontSize;
  }

  if (Object.keys(styles).length) {
    return styles;
  }
}

export const HTMLConfig = {
  styleToHTML(style) {
    if (style.startsWith(COLOR_STYLE_PREFIX) || style.startsWith(FONTSIZE_STYLE_PREFIX)) {
      return <span data-msn={style} style={customStyleFn(style)} />;
    }
  },

  htmlToStyle(nodeName, node, currentStyle) {
    if (node.dataset.msn) {
      return currentStyle.add(node.dataset.msn);
    }

    let nextStyle = currentStyle;
    if (node.style.color) {
      nextStyle = nextStyle.add(`${COLOR_STYLE_PREFIX}${node.style.color}`);
    }
    if (node.style.fontSize) {
      nextStyle = nextStyle.add(`${FONTSIZE_STYLE_PREFIX}${node.style.fontSize}`);
    }
    return nextStyle;
  },
};

const createTextSizePlugin = () => {
  return {
    toolbarComponents: [ToolbarColorPicker, ToolbarFontPicker],
    customStyleFn,
  };
};

export default createTextSizePlugin;
