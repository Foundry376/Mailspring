import React from 'react';
import { Mark } from 'slate';
import { CompactPicker } from 'react-color';

// Helper Functions

function removeMarksOfTypeInRange(change, range, type) {
  if (range.isCollapsed) {
    const active = change.value.activeMarks.find(m => m.type === type);
    if (active) {
      change.removeMark(active);
    }
    return change;
  }
  const document = change.value.document;
  const texts = document.getTextsAtRange(range);
  const { startKey, startOffset, endKey, endOffset } = range;

  texts.forEach(node => {
    const { key } = node;
    let index = 0;
    let length = node.text.length;

    if (key === startKey) index = startOffset;
    if (key === endKey) length = endOffset;
    if (key === startKey && key === endKey) length = endOffset - startOffset;

    node.getMarks().forEach(mark => {
      if (mark.type === type) {
        change.removeMarkByKey(key, index, length, mark, { normalize: true });
      }
    });
  });

  return change;
}

export function hasMark(value, type) {
  try {
    return !!value.activeMarks.find(m => m.type === type);
  } catch (err) {
    // this occasionally throws when selection is undefined
    return false;
  }
}

export function getActiveValueForMark(value, type) {
  try {
    const active = value.activeMarks.find(m => m.type === type);
    return (active && active.data.get('value')) || '';
  } catch (err) {
    // this occasionally throws when selection is undefined
    return '';
  }
}

export function applyValueForMark(value, type, markValue) {
  let change = value.change().focus();
  removeMarksOfTypeInRange(change, value.selection, type);

  if (markValue) {
    change.addMark({
      type,
      data: {
        value: markValue,
      },
    });
  }

  return change;
}

// React Component Factories

export function BuildToggleButton({ type, button: { iconClass, isActive, onToggle } }) {
  return ({ value, onChange }) => {
    const active = isActive(value);
    const onMouseDown = e => {
      onChange(onToggle(value, active));
      e.preventDefault();
    };
    return (
      <button className={active ? 'active' : ''} onMouseDown={onMouseDown}>
        <i title={type} className={iconClass} />
      </button>
    );
  };
}

export function BuildMarkButtonWithValuePicker(config) {
  return class ToolbarMarkDataPicker extends React.Component {
    constructor(props) {
      super(props);

      this.state = {
        fieldValue: '',
        expanded: false,
      };
    }

    onPrompt = e => {
      e.preventDefault();
      const active = hasMark(this.props.value, config.type);
      const fieldValue = (active && active.data.get(config.field)) || '';
      this.setState({ expanded: true, fieldValue: fieldValue }, () => {
        setTimeout(() => this._inputEl.focus(), 0);
      });
    };

    onConfirm = e => {
      e.preventDefault();

      // attach the URL value to the LINK that was created when we opened the link modal
      const { value, onChange } = this.props;
      const { fieldValue } = this.state;
      const newMark = Mark.create({
        type: config.type,
        data: {
          [config.field]: fieldValue,
        },
      });

      if (value.selection.isCollapsed) {
        onChange(
          value
            .change()
            .addMark(newMark)
            .insertText(fieldValue)
            .removeMark(newMark)
            .insertText(' ')
            .focus()
        );
      } else {
        onChange(
          removeMarksOfTypeInRange(value.change(), value.selection, config.type)
            .addMark(newMark)
            .focus()
        );
      }

      this.setState({ expanded: false, fieldValue: '' });
    };

    onRemove = e => {
      e.preventDefault();
      const { value, onChange } = this.props;
      const active = hasMark(this.props.value, config.type);
      if (value.selection.isCollapsed) {
        const anchorNode = value.document.getNode(value.selection.anchorKey);
        const expanded = value.selection.moveToRangeOf(anchorNode);
        onChange(value.change().removeMarkAtRange(expanded, active));
      } else {
        onChange(value.change().removeMark(active));
      }
    };

    onBlur = e => {
      if (!this._el.contains(e.relatedTarget)) {
        this.setState({ expanded: false });
      }
    };

    render() {
      const { expanded } = this.state;
      const active = hasMark(this.props.value, config.type);

      return (
        <div
          className={`link-picker`}
          ref={el => (this._el = el)}
          tabIndex={-1}
          onBlur={this.onBlur}
        >
          {active ? (
            <button className="active" onMouseDown={this.onRemove}>
              <i className={config.iconClassOn} />
            </button>
          ) : (
            <button onMouseDown={this.onPrompt}>
              <i className={config.iconClassOff} />
            </button>
          )}
          {expanded && (
            <div className="dropdown">
              <input
                type="text"
                placeholder={config.placeholder}
                value={this.state.fieldValue}
                ref={el => (this._inputEl = el)}
                onBlur={this.onBlur}
                onChange={e => this.setState({ fieldValue: e.target.value })}
                onKeyDown={e => {
                  if (e.which === 13) {
                    this.onConfirm(e);
                  }
                }}
              />
              <button onMouseDown={this.onConfirm}>Add</button>
            </div>
          )}
        </div>
      );
    }
  };
}

export function BuildColorPicker(config) {
  return class ToolbarColorPicker extends React.Component {
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
      this.setState({ expanded: false });
      const { value, onChange } = this.props;
      const markValue = hex !== config.default ? hex : null;
      onChange(applyValueForMark(value, config.type, markValue));
    };

    shouldComponentUpdate(nProps, nState) {
      if (
        getActiveValueForMark(nProps.value, config.type) !==
        getActiveValueForMark(this.props.value, config.type)
      )
        return true;
      if (nState.expanded !== this.state.expanded) return true;
      return false;
    }

    render() {
      const color = getActiveValueForMark(this.props.value, config.type) || config.default;
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
  };
}

export function BuildFontPicker(config) {
  return class FontPicker extends React.Component {
    _onSetFontSize = e => {
      const { onChange, value } = this.props;
      const markValue = e.target.value !== config.default ? e.target.value : null;
      onChange(applyValueForMark(value, config.type, markValue));
    };

    shouldComponentUpdate(nextProps) {
      return (
        getActiveValueForMark(nextProps.value, config.type) !==
        getActiveValueForMark(this.props.value, config.type)
      );
    }

    render() {
      const fontSize = getActiveValueForMark(this.props.value, config.type) || config.default;

      return (
        <button style={{ padding: 0 }}>
          <i className="fa fa-text-height" />
          <select
            onFocus={this._onFocus}
            value={fontSize}
            onChange={this._onSetFontSize}
            tabIndex={-1}
          >
            {[
              '10pt',
              '11pt',
              '12pt',
              '13pt',
              '14pt',
              '16pt',
              '18pt',
              '22pt',
              '24pt',
              '26pt',
            ].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </button>
      );
    }
  };
}
