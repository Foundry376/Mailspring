import React from 'react';
import { RichUtils } from 'draft-js';

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

  render() {
    const { editorState, onChange, onFocusComposer, plugins } = this.props;

    const currentStyle = editorState.getCurrentInlineStyle();
    const selection = editorState.getSelection();
    const blockType = editorState
      .getCurrentContent()
      .getBlockForKey(selection.getStartKey())
      .getType();

    const pluginItems = [];
    plugins.forEach((plugin, idx) => {
      if (plugin.toolbarComponents) {
        pluginItems.push(<div key={idx} className="divider" />);
        plugin.toolbarComponents.forEach((Component, cdx) => {
          pluginItems.push(
            <Component
              key={`${idx}-${cdx}`}
              editorState={editorState}
              onChange={onChange}
              onFocusComposer={onFocusComposer}
            />
          );
        });
      }
    });

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

        {pluginItems}
      </div>
    );
  }
}
