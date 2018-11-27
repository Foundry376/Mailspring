import React from 'react';
import { Mark } from 'slate';
import { CompactPicker } from 'react-color';

// Helper Functions

function removeMarksOfTypeInRange(editor, range, type) {
  if (range.isCollapsed) {
    const active = editor.value.activeMarks.find(m => m.type === type);
    if (active) {
      editor.removeMark(active);
    }
    return;
  }
  const document = editor.value.document;
  const texts = document.getTextsAtRange(range);
  const { start, end } = range;

  texts.forEach(node => {
    const { key } = node;
    let index = 0;
    let length = node.text.length;

    if (key === start.key) index = start.offset;
    if (key === end.key) length = end.offset;
    if (key === start.key && key === end.key) length = end.offset - start.offset;

    node.getMarks().forEach(mark => {
      if (mark.type === type) {
        editor.removeMarkByKey(key, index, length, mark, { normalize: true });
      }
    });
  });
}

export function expandSelectionToRangeOfMark(editor, type) {
  const { selection, document } = editor.value;
  const node = document.getNode(selection.anchor.key);
  let start = selection.anchor.offset;
  let end = selection.anchor.offset;

  // expand backwards until the mark disappears
  while (start > 0 && node.getMarksAtIndex(start).find(m => m.type === type)) {
    start -= 1;
  }
  // expand forwards until the mark disappears
  while (end < node.text.length - 1 && node.getMarksAtIndex(end + 1).find(m => m.type === type)) {
    end += 1;
  }

  // expand selection
  editor.select({
    anchor: { key: selection.anchor.key, offset: start },
    focus: { key: selection.anchor.key, offset: end },
    isFocused: true,
    isBackward: false,
  });
}

export function hasMark(value, type) {
  return !!getMarkOfType(value, type);
}

export function getMarkOfType(value, type) {
  try {
    return value.activeMarks.find(m => m.type === type);
  } catch (err) {
    // this occasionally throws when selection is undefined
    return null;
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

export function applyValueForMark(editor, type, markValue) {
  editor.focus();
  removeMarksOfTypeInRange(editor, editor.value.selection, type);

  if (markValue) {
    editor.addMark({
      type,
      data: {
        value: markValue,
      },
    });
  }
}

// React Component Factories

export function BuildToggleButton({ type, button: { iconClass, isActive, onToggle } }) {
  return ({ value, editor, className }) => {
    const active = isActive(value);
    const onMouseDown = e => {
      onToggle(editor, active);
      e.preventDefault();
    };
    return (
      <button className={`${className} ${active ? 'active' : ''}`} onMouseDown={onMouseDown}>
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
      const active = getMarkOfType(this.props.value, config.type);
      const fieldValue = (active && active.data.get(config.field)) || '';
      this.setState({ expanded: true, fieldValue: fieldValue }, () => {
        setTimeout(() => {
          this._inputEl.focus();
          this._inputEl.select();
        }, 0);
      });
    };

    onConfirm = e => {
      e.preventDefault();

      // attach the URL value to the LINK that was created when we opened the link modal
      const { value, editor } = this.props;
      const { fieldValue } = this.state;

      if (fieldValue.trim() === '') {
        this.onRemove(e);
        this.setState({ expanded: false, fieldValue: '' });
        return;
      }

      const newMark = Mark.create({
        type: config.type,
        data: {
          [config.field]: fieldValue,
        },
      });

      const active = getMarkOfType(this.props.value, config.type);
      if (active) {
        // update the active mark
        expandSelectionToRangeOfMark(editor, config.type);
        removeMarksOfTypeInRange(editor, value.selection, config.type);
        editor.addMark(newMark);
        editor.focus();
      } else if (value.selection.isCollapsed) {
        // apply new mark to new text
        editor
          .addMark(newMark)
          .insertText(fieldValue)
          .removeMark(newMark)
          .insertText(' ')
          .focus();
      } else {
        // apply new mark to selected text
        removeMarksOfTypeInRange(editor, value.selection, config.type);
        editor.addMark(newMark);
        editor.focus();
      }

      this.setState({ expanded: false, fieldValue: '' });
    };

    onRemove = e => {
      e.preventDefault();
      const { value, editor } = this.props;
      const active = getMarkOfType(this.props.value, config.type);
      if (value.selection.isCollapsed) {
        const anchorNode = value.document.getNode(value.selection.anchor.key);
        const expanded = value.selection.moveToRangeOf(anchorNode);
        editor.removeMarkAtRange(expanded, active);
      } else {
        editor.removeMark(active);
      }
    };

    onBlur = e => {
      if (!this._el.contains(e.relatedTarget)) {
        this.setState({ expanded: false });
      }
    };

    render() {
      const { expanded } = this.state;
      const active = getMarkOfType(this.props.value, config.type);
      return (
        <div
          className={`${this.props.className} link-picker`}
          ref={el => (this._el = el)}
          tabIndex={-1}
          onBlur={this.onBlur}
        >
          {active ? (
            <button className="active" onMouseDown={this.onPrompt}>
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
              <button onMouseDown={this.onConfirm}>{active ? 'Save' : 'Add'}</button>
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
      const { editor } = this.props;
      const markValue = hex !== config.default ? hex : null;
      applyValueForMark(editor, config.type, markValue);
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
          className={this.props.className}
          style={{ display: 'inline-block', position: 'relative' }}
        >
          <button
            onClick={this._onToggleExpanded}
            style={{
              cursor: 'pointer',
              width: 20,
              height: 14,
              backgroundColor: color,
              marginRight: 4,
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
    _onSetValue = e => {
      const { editor } = this.props;
      let markValue = e.target.value !== config.default ? e.target.value : null;
      if (!(typeof config.options[0].value === 'string')) {
        markValue = markValue / 1;
      }
      applyValueForMark(editor, config.type, markValue);
    };

    shouldComponentUpdate(nextProps) {
      return (
        getActiveValueForMark(nextProps.value, config.type) !==
        getActiveValueForMark(this.props.value, config.type)
      );
    }

    render() {
      const value = getActiveValueForMark(this.props.value, config.type) || config.default;
      const displayed = config.convert(value);

      return (
        <button
          style={{ padding: 0, paddingRight: 6 }}
          className={`${this.props.className} with-select`}
        >
          <i className={config.iconClass} />
          <select
            onFocus={this._onFocus}
            value={displayed}
            onChange={this._onSetValue}
            tabIndex={-1}
          >
            {config.options.map(({ name, value }) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </button>
      );
    }
  };
}
