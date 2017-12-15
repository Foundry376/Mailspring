import React from 'react';
import { Editor } from 'draft-js';

export default class ComposerEditor extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { className, editorState, onChange } = this.props;

    return (
      <div className="RichEditor-root">
        {/* <BlockStyleControls editorState={editorState} onToggle={this.toggleBlockType} />
        <InlineStyleControls editorState={editorState} onToggle={this.toggleInlineStyle} /> */}
        <div className={className} onClick={this.focus}>
          <Editor
            // blockStyleFn={getBlockStyle}
            // customStyleMap={styleMap}
            spellCheck
            editorState={editorState}
            handleKeyCommand={this.handleKeyCommand}
            onChange={onChange}
            onTab={this.onTab}
          />
        </div>
      </div>
    );
  }
}
