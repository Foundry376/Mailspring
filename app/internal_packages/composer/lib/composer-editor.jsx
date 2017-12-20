import React from 'react';
import Editor, { composeDecorators } from 'draft-js-plugins-editor';
import { RichUtils, AtomicBlockUtils, EditorState, SelectionState } from 'draft-js';

import ComposerEditorToolbar from './composer-editor-toolbar';

import createInlineAttachmentPlugin from './inline-attachment-plugin';
import createLinkifyPlugin from './linkify-plugin';

import createFocusPlugin from 'draft-js-focus-plugin';
import createAutoListPlugin from 'draft-js-autolist-plugin';
import createEmojiPlugin from 'draft-js-emoji-plugin';

const focusPlugin = createFocusPlugin();
const emojiPlugin = createEmojiPlugin({
  useNativeArt: true,
});
const { EmojiSuggestions, EmojiSelect } = emojiPlugin;

export default class ComposerEditor extends React.Component {
  constructor(props) {
    super(props);

    const inlineAttachmentPlugin = createInlineAttachmentPlugin({
      decorator: composeDecorators(focusPlugin.decorator),
      getExposedProps: () => this.props.atomicBlockProps,
      onRemoveBlockWithKey: this.onRemoveBlockWithKey,
    });

    this.plugins = [
      focusPlugin,
      createLinkifyPlugin(),
      createAutoListPlugin(),
      emojiPlugin,
      inlineAttachmentPlugin,
    ];
  }

  componentDidMount() {
    // attach the decorators we use to EditorState
    // this.props.onChange(EditorState.set(this.props.editorState, { decorator }));
  }

  // Public API

  focus = () => {
    this._editorComponent.focus();
  };

  focusAbsoluteEnd = () => {
    window.requestAnimationFrame(() => {
      this.props.onChange(EditorState.moveSelectionToEnd(this.props.editorState));
      this._editorComponent.focus();
    });
  };

  insertInlineAttachment = file => {
    const { editorState, onChange } = this.props;
    const contentState = editorState.getCurrentContent();
    const contentStateWithEntity = contentState.createEntity('image', 'IMMUTABLE', {
      fileId: file.id,
    });
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });

    onChange(AtomicBlockUtils.insertAtomicBlock(newEditorState, entityKey, ' '));
  };

  // Event Handlers

  onHandleKeyCommand = (command, editorState) => {
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      this.props.onChange(newState);
      return true;
    }
    return false;
  };

  onTab = e => {
    const maxDepth = 4;
    const { editorState, onChange } = this.props;
    onChange(RichUtils.onTab(e, editorState, maxDepth));
  };

  onRemoveBlockWithKey = blockKey => {
    const { onChange, editorState } = this.props;

    var content = editorState.getCurrentContent();
    var blockBefore = content.getBlockBefore(blockKey);

    const selectionAfter = new SelectionState({
      anchorOffset: blockBefore.getLength(),
      anchorKey: blockBefore.getKey(),
      focusOffset: blockBefore.getLength(),
      focusKey: blockBefore.getKey(),
      isBackward: false,
      hasFocus: true,
    });

    var blockMap = content.getBlockMap()['delete'](blockKey);
    var withoutAtomicBlock = content.merge({ blockMap, selectionAfter });
    if (withoutAtomicBlock !== content) {
      onChange(EditorState.push(editorState, withoutAtomicBlock, 'remove-range'));
    }
  };

  onPastedFiles = files => {
    files.forEach(item => {
      const temp = require('temp');
      const path = require('path');
      const fs = require('fs');
      const ext =
        {
          'image/png': '.png',
          'image/jpg': '.jpg',
          'image/tiff': '.tiff',
        }[item.type] || '';

      const reader = new FileReader();
      reader.addEventListener('loadend', () => {
        const buffer = new Buffer(new Uint8Array(reader.result));
        const tmpFolder = temp.path('-nylas-attachment');
        const tmpPath = path.join(tmpFolder, `Pasted File${ext}`);
        fs.mkdir(tmpFolder, () => {
          fs.writeFile(tmpPath, buffer, () => {
            this.props.onFileReceived(tmpPath);
          });
        });
      });
      reader.readAsArrayBuffer(item);
    });
  };

  render() {
    const { className, editorState, onChange } = this.props;

    return (
      <div className="RichEditor-root">
        <ComposerEditorToolbar
          editorState={editorState}
          onChange={onChange}
          onFocusComposer={this.focus}
          extras={[<EmojiSelect key="emoji" />]}
        />
        <div className={className} onClick={this.focus}>
          <Editor
            ref={el => (this._editorComponent = el)}
            // blockRendererFn={this.blockRenderer}
            // blockStyleFn={blockStyleFn}
            // customStyleFn={customStyleFn}
            // handleKeyCommand={this.onHandleKeyCommand}
            handlePastedFiles={this.onPastedFiles}
            editorState={editorState}
            onChange={onChange}
            onTab={this.onTab}
            plugins={this.plugins}
            spellCheck
          />
          <EmojiSuggestions />
        </div>
      </div>
    );
  }
}
