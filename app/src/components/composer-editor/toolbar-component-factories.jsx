import React from 'react';
import ReactDOM from 'react-dom';
import { Mark } from 'slate';
import { CompactPicker } from 'react-color';
import { RetinaImg } from 'mailspring-component-kit';
import { Actions } from 'mailspring-exports';
import FontSizePopover from './font-size-popover';
import ButtonValuePickerPopover from './button-value-picker-popover';

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

export function expandSelectionToRangeOfMark(change, type) {
  const { selection, document } = change.value;
  const node = document.getNode(selection.anchorKey);
  let start = selection.anchorOffset;
  let end = selection.anchorOffset;

  // expand backwards until the mark disappears
  while (start > 0 && node.getMarksAtIndex(start).find(m => m.type === type)) {
    start -= 1;
  }
  // expand forwards until the mark disappears
  while (end < node.text.length - 1 && node.getMarksAtIndex(end + 1).find(m => m.type === type)) {
    end += 1;
  }

  // expand selection
  change.select({
    anchorKey: selection.anchorKey,
    anchorOffset: start,
    focusKey: selection.anchorKey,
    focusOffset: end,
    isFocused: true,
    isBackward: false,
  });
  return change;
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

export function BuildToggleButton({ type, button: { iconClass, isActive, onToggle, svgName = '', isVisible = () => true, hideWhenCrowded = false } }) {
  return ({ value, onChange, className }) => {
    if (!isVisible()) {
      return null;
    }
    const active = isActive(value);
    const onMouseDown = e => {
      onChange(onToggle(value, active));
      e.preventDefault();
    };
    if (svgName) {
      return (<button className={`${className} ${active ? 'active' : ''} ${hideWhenCrowded ? 'hide-when-crowded' : ''}`} onMouseDown={onMouseDown}>
        <RetinaImg style={{ width: 18 }} name={svgName} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </button>)
    }
    return (
      <button className={`${className} ${active ? 'active' : ''} ${hideWhenCrowded ? 'hide-when-crowded' : ''}`} onMouseDown={onMouseDown}>
        <i title={type} className={iconClass} />
      </button>
    );
  };
}

export function BuildMarkButtonWithValuePicker(
  config,
  { alwaysShow = false, anchorEl = null } = {}
) {
  return class ToolbarMarkDataPicker extends React.Component {
    constructor(props) {
      super(props);

      this.state = {
        fieldValue: '',
        expanded: false,
      };
    }

    _onExpandStateChange = () => {
      const el = ReactDOM.findDOMNode(this._el);
      if (!el && !anchorEl) {
        AppEnv.reportError(new Error('BuildMarkButtonWithValuePicker cannot find node'));
        return;
      }
      if (this.state.expanded) {
        Actions.openPopover(
          <ButtonValuePickerPopover
            value={this.state.fieldValue}
            onBlur={this.onBlur}
            onConfirm={this.onConfirm}
            config={config}
            active={getMarkOfType(this.props.value, config.type)}
          />,
          {
            originRect: anchorEl ? anchorEl : el.getBoundingClientRect(),
            direction: 'down',
            closeOnAppBlur: true,
          }
        );
      } else {
        Actions.closePopover();
      }
    };

    onPrompt = e => {
      e.preventDefault();
      const active = getMarkOfType(this.props.value, config.type);
      const fieldValue = (active && active.data.get(config.field)) || '';
      this.setState({ expanded: true, fieldValue: fieldValue }, () => {
        this._onExpandStateChange();
        // setTimeout(() => {
        //   this._inputEl.focus();
        //   this._inputEl.select();
        // }, 0);
      });
    };

    onConfirm = inputValue => {

      // attach the URL value to the LINK that was created when we opened the link modal
      const { value, onChange } = this.props;
      const fieldValue = inputValue;

      if (fieldValue.trim() === '') {
        this.onRemove();
        this.setState({ expanded: false, fieldValue: '' }, this._onExpandStateChange);
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
        const change = value.change();
        expandSelectionToRangeOfMark(change, config.type);
        removeMarksOfTypeInRange(change, value.selection, config.type)
          .addMark(newMark)
          .focus();
        onChange(change);
      } else if (value.selection.isCollapsed) {
        // apply new mark to new text
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
        // apply new mark to selected text
        onChange(
          removeMarksOfTypeInRange(value.change(), value.selection, config.type)
            .addMark(newMark)
            .focus()
        );
      }

      this.setState({ expanded: false, fieldValue: '' }, this._onExpandStateChange);
    };

    onRemove = () => {
      const { value, onChange } = this.props;
      const active = getMarkOfType(this.props.value, config.type);
      if (value.selection.isCollapsed) {
        const anchorNode = value.document.getNode(value.selection.anchorKey);
        const expanded = value.selection.moveToRangeOf(anchorNode);
        onChange(value.change().removeMarkAtRange(expanded, active));
      } else {
        onChange(value.change().removeMark(active));
      }
    };

    onBlur = e => {
      this.setState({ expanded: false }, this._onExpandStateChange);
    };

    render() {
      const { expanded } = this.state;
      const active = getMarkOfType(this.props.value, config.type);
      return (
        <div
          className={`${this.props.className} link-picker ${alwaysShow ? '' : 'hide-when-crowded'}`}
          ref={el => (this._el = el)}
          tabIndex={-1}
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
          {/*{expanded && (*/}
          {/*  <div className="dropdown">*/}
          {/*    <input*/}
          {/*      type="text"*/}
          {/*      placeholder={config.placeholder}*/}
          {/*      value={this.state.fieldValue}*/}
          {/*      ref={el => (this._inputEl = el)}*/}
          {/*      onBlur={this.onBlur}*/}
          {/*      onChange={e => this.setState({ fieldValue: e.target.value })}*/}
          {/*      onKeyDown={e => {*/}
          {/*        if (e.which === 13) {*/}
          {/*          this.onConfirm(e);*/}
          {/*        }*/}
          {/*      }}*/}
          {/*    />*/}
          {/*    <button onMouseDown={this.onConfirm}>{active ? 'Save' : 'Add'}</button>*/}
          {/*  </div>*/}
          {/*)}*/}
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
          className={this.props.className + ' color-picker'}
          style={{ display: 'inline-block', position: 'relative' }}
        >
          <button
            onClick={this._onToggleExpanded}
            style={{
              position: 'absolute',
              top: 9,
              left: 6,
              cursor: 'pointer',
              width: 14,
              height: 14,
              borderRadius: 3,
              backgroundColor: color,
              marginRight: 4,
              marginLeft: 4,
              marginBottom: 2,
              verticalAlign: 'middle',
            }}
          />
          {expanded && (
            <div className="dropdown" style={{ top: 30 }}>
              <CompactPicker color={color} onChangeComplete={this._onChangeComplete} />
            </div>
          )}
        </div>
      );
    }
  };
}
export function BuildFontSizePicker(config) {
  return class FontPicker extends React.Component {
    _onSetValue = item => {
      const { onChange, value } = this.props;
      let markValue = item !== config.default ? item : null;
      if (!(typeof config.options[0].value === 'string')) {
        markValue = markValue / 1;
      }
      onChange(applyValueForMark(value, config.type, markValue));
    };

    shouldComponentUpdate(nextProps) {
      return (
        getActiveValueForMark(nextProps.value, config.type) !==
        getActiveValueForMark(this.props.value, config.type)
      );
    }
    onClick = e => {
      const value = getActiveValueForMark(this.props.value, config.type) || config.default;
      Actions.openPopover((
        <FontSizePopover
          options={config.options}
          selectedValue={value}
          onSelect={this._onSetValue} />
      ), {
          originRect: this.fontSizeBtn.getBoundingClientRect(),
          direction: 'down',
          closeOnAppBlur: true
        });
    };

    render() {
      return (
        <button
          style={{ padding: '6px, 0px', width: 40 }}
          className={`${this.props.className || ''} pull-right with-popup`}
          onClick={this.onClick}
          ref={el => this.fontSizeBtn = el}
        >
          <i className={config.iconClass} />
          <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      );
    }
  };
}

export function BuildFontPicker(config) {
  return class FontPicker extends React.Component {
    _onSetValue = e => {
      const { onChange, value } = this.props;
      let markValue = e.target.value !== config.default ? e.target.value : null;
      if (!(typeof config.options[0].value === 'string')) {
        markValue = markValue / 1;
      }
      onChange(applyValueForMark(value, config.type, markValue));
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
          <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      );
    }
  };
}
