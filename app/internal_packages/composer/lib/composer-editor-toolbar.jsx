import React from 'react';
import { RichUtils, EditorState, SelectionState } from 'draft-js';
import { CompactPicker } from 'react-color';

import { styleValueForGroup, COLOR_STYLE_PREFIX, FONTSIZE_STYLE_PREFIX } from './draftjs-config';

const BLOCK_TYPES = [
  { label: 'Blockquote', style: 'blockquote', fa: 'fa fa-quote-left' },
  { label: 'UL', style: 'unordered-list-item', fa: 'fa fa-list-ul' },
  { label: 'OL', style: 'ordered-list-item', fa: 'fa fa-list-ol' },
  { label: 'Code Block', style: 'code-block', fa: 'fa fa-code' },
];

const INLINE_STYLES = [
  { label: 'Bold', style: 'BOLD', fa: 'fa fa-bold' },
  { label: 'Italic', style: 'ITALIC', fa: 'fa fa-italic' },
  { label: 'Underline', style: 'UNDERLINE', fa: 'fa fa-underline' },
  { label: 'Monospace', style: 'CODE', fa: 'fa fa-code' },
];

function getCurrentLink(editorState) {
  const contentState = editorState.getCurrentContent();
  const startKey = editorState.getSelection().getStartKey();
  const startOffset = editorState.getSelection().getStartOffset();
  const blockWithLinkAtBeginning = contentState.getBlockForKey(startKey);
  const linkKey = blockWithLinkAtBeginning.getEntityAt(startOffset);

  if (linkKey) {
    const linkInstance = contentState.getEntity(linkKey);
    return linkInstance.getData().url;
  }
  return null;
}

class ColorPicker extends React.Component {
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
    this.props.onSetColor(hex);
    this.setState({ expanded: false });
  };

  render() {
    const { color } = this.props;
    const { expanded } = this.state;

    return (
      <div
        tabIndex="-1"
        onBlur={this._onBlur}
        ref={el => (this._el = el)}
        style={{ display: 'inline-block', position: 'relative' }}
      >
        <div
          onClick={this._onToggleExpanded}
          style={{ cursor: 'pointer', width: 20, height: 14, backgroundColor: color }}
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

class LinkPicker extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      urlValue: '',
      expanded: false,
    };
  }
  onPromptForLink = e => {
    e.preventDefault();
    const { editorState } = this.props;

    const selection = editorState.getSelection();
    if (!selection.isCollapsed()) {
      this.setState(
        {
          expanded: true,
          urlValue: getCurrentLink(editorState) || '',
        },
        () => {
          setTimeout(() => this._linkInputEl.focus(), 0);
        }
      );
    }
  };

  onConfirmLink = e => {
    e.preventDefault();

    // attach the URL value to the LINK that was created when we opened the link modal
    const { urlValue } = this.state;
    const { editorState, onChange } = this.props;
    const contentState = editorState.getCurrentContent();
    const contentStateWithEntity = contentState.createEntity('LINK', 'MUTABLE', { url: urlValue });
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
    onChange(RichUtils.toggleLink(newEditorState, newEditorState.getSelection(), entityKey));

    this.setState({ expanded: false, urlValue: '' }, () => {
      window.requestAnimationFrame(this.props.onFocusComposer);
    });
  };

  onRemoveLink = e => {
    e.preventDefault();
    const { editorState, onChange } = this.props;
    let selection = editorState.getSelection();

    if (selection.isCollapsed()) {
      // expand the selection to include the entire link by finding the range of
      // characters that have an attached LINK entity.
      const selectionKey = selection.getAnchorKey();
      const contentState = editorState.getCurrentContent();
      const block = contentState.getBlockForKey(selectionKey);
      block.findEntityRanges(
        charMetadata => {
          const entityKey = charMetadata.getEntity();
          const entity = entityKey && contentState.getEntity(entityKey);
          return entity && entity.getType() === 'LINK';
        },
        (start, end) => {
          selection = new SelectionState({
            anchorOffset: start,
            anchorKey: selectionKey,
            focusOffset: end,
            focusKey: selectionKey,
            isBackward: false,
            hasFocus: selection.getHasFocus(),
          });
        }
      );
    }
    onChange(RichUtils.toggleLink(editorState, selection, null));
  };

  onBlur = e => {
    if (!this._el.contains(e.relatedTarget)) {
      this.setState({ expanded: false });
    }
  };

  render() {
    const { expanded } = this.state;

    return (
      <div className="link-picker" ref={el => (this._el = el)} tabIndex={-1} onBlur={this.onBlur}>
        {getCurrentLink(this.props.editorState) ? (
          <button onMouseDown={this.onRemoveLink}>
            <i className="fa fa-unlink" />
          </button>
        ) : (
          <button onMouseDown={this.onPromptForLink}>
            <i className="fa fa-link" />
          </button>
        )}
        {expanded && (
          <div className="dropdown">
            <input
              type="text"
              placeholder="http://"
              value={this.state.urlValue}
              ref={el => (this._linkInputEl = el)}
              onBlur={this.onBlur}
              onChange={e => this.setState({ urlValue: e.target.value })}
              onKeyDown={e => {
                if (e.which === 13) {
                  this.onConfirmLink(e);
                }
              }}
            />
            <button onMouseDown={this.onConfirmLink}>Add</button>
          </div>
        )}
      </div>
    );
  }
}

class FontPicker extends React.Component {
  render() {
    return (
      <button>
        <i className="fa fa-text-height" />
        <select
          value={this.props.fontSize}
          onChange={e => this.props.onSetFontSize(e.target.value)}
        >
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

class StyleButton extends React.Component {
  constructor() {
    super();
    this.onToggle = e => {
      e.preventDefault();
      this.props.onToggle(this.props.style);
    };
  }

  render() {
    return (
      <button onMouseDown={this.onToggle} className={this.props.active ? 'active' : ''}>
        <i title={this.props.label} className={this.props.fa} />
      </button>
    );
  }
}

export default class ComposerEditorToolbar extends React.Component {
  onToggleBlockType = blockType => {
    const { editorState, onChange } = this.props;
    onChange(RichUtils.toggleBlockType(editorState, blockType));
  };

  onToggleInlineStyle = inlineStyle => {
    const { editorState, onChange } = this.props;
    onChange(RichUtils.toggleInlineStyle(editorState, inlineStyle));
  };

  onToggleInlineValueInGroup = (groupPrefix, groupValue) => {
    this.props.onFocusComposer();

    window.requestAnimationFrame(() => {
      // TODO: Get all inine styles in selected area, not just at insertion point

      const { editorState, onChange } = this.props;
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

      onChange(nextEditorState);
    });
  };

  render() {
    const { editorState, onChange, onFocusComposer } = this.props;

    const currentStyle = editorState.getCurrentInlineStyle();
    const selection = editorState.getSelection();
    const blockType = editorState
      .getCurrentContent()
      .getBlockForKey(selection.getStartKey())
      .getType();

    return (
      <div className="RichEditor-toolbar">
        {INLINE_STYLES.map(type => (
          <StyleButton
            key={type.label}
            active={currentStyle.has(type.style)}
            label={type.label}
            onToggle={this.onToggleInlineStyle}
            style={type.style}
            fa={type.fa}
          />
        ))}

        <div className="divider" />

        <ColorPicker
          color={styleValueForGroup(currentStyle, COLOR_STYLE_PREFIX) || '#000'}
          onSetColor={colorKey => {
            this.onToggleInlineValueInGroup(COLOR_STYLE_PREFIX, colorKey);
          }}
        />
        <FontPicker
          fontSize={styleValueForGroup(currentStyle, FONTSIZE_STYLE_PREFIX) || '14px'}
          onSetFontSize={size => {
            this.onToggleInlineValueInGroup(FONTSIZE_STYLE_PREFIX, size);
          }}
        />

        <div className="divider" />

        {BLOCK_TYPES.map(type => (
          <StyleButton
            key={type.label}
            active={type.style === blockType}
            label={type.label}
            onToggle={this.onToggleBlockType}
            style={type.style}
            fa={type.fa}
          />
        ))}

        <div className="divider" />

        <LinkPicker
          editorState={editorState}
          onChange={onChange}
          onFocusComposer={onFocusComposer}
        />
      </div>
    );
  }
}
