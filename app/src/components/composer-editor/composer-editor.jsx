import React from 'react';
import Editor, { composeDecorators } from 'draft-js-plugins-editor';
import { RichUtils, EditorState, SelectionState } from 'draft-js';

import ComposerEditorToolbar from './composer-editor-toolbar';

import createInlineAttachmentPlugin, {
  editorStateInsertingInlineAttachment,
} from './inline-attachment-plugin';
import createLinkifyPlugin from './linkify-plugin';
import createTextStylePlugin from './text-style-plugin';

import createFocusPlugin from 'draft-js-focus-plugin';
import createAutoListPlugin from 'draft-js-autolist-plugin';
import createEmojiPlugin from 'draft-js-emoji-plugin';
import createQuotedTextPlugin, { selectEndOfReply } from './quoted-text-plugin';
import createTemplatesPlugin from './templates-plugin';

const focusPlugin = createFocusPlugin();
const emojiPlugin = createEmojiPlugin({
  useNativeArt: true,
});
const { EmojiSuggestions } = emojiPlugin;
emojiPlugin.toolbarComponents = [];
emojiPlugin.topLevelComponents = [EmojiSuggestions];

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
      createTextStylePlugin(),
      createQuotedTextPlugin(),
      createTemplatesPlugin(),
      emojiPlugin,
      inlineAttachmentPlugin,
    ];
  }

  // Public API

  focus = () => {
    if (!this._editorComponent) return;
    this._editorComponent.focus();
  };

  focusEndReplyText = () => {
    window.requestAnimationFrame(() => {
      this.props.onChange(selectEndOfReply(this.props.editorState));
      this.focus();
    });
  };

  focusEndAbsolute = () => {
    window.requestAnimationFrame(() => {
      this.props.onChange(EditorState.moveSelectionToEnd(this.props.editorState));
      this.focus();
    });
  };

  insertInlineAttachment = file => {
    const { editorState, onChange } = this.props;
    onChange(editorStateInsertingInlineAttachment(editorState, file));
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
    const { className, onChange, onBlur } = this.props;
    const spellCheck = AppEnv.config.get('core.composing.spellcheck');

    let editorState = this.props.editorState;
    if (!this._hasFixedDraftJSPluginsIssue637) {
      editorState = EditorState.createEmpty();
    }

    return (
      <div className="RichEditor-root">
        <ComposerEditorToolbar
          editorState={editorState}
          onChange={onChange}
          onFocusComposer={this.focus}
          plugins={this.plugins}
        />
        <div className={className} onClick={this.focus}>
          <Editor
            ref={el => (this._editorComponent = el)}
            handleKeyCommand={this.onHandleKeyCommand}
            handlePastedFiles={this.onPastedFiles}
            editorState={editorState}
            onBlur={onBlur}
            onChange={next => {
              // Don't allow draft-js-plugins to initialize our selection to the end
              if (!this._hasFixedDraftJSPluginsIssue637) {
                this._hasFixedDraftJSPluginsIssue637 = true;
                next = EditorState.set(this.props.editorState, {
                  decorator: next.getDecorator(),
                });
              }
              onChange(next);
            }}
            onTab={this.onTab}
            plugins={this.plugins}
            spellCheck={spellCheck}
          />
          {this.plugins
            .reduce((arr, p) => (p.topLevelComponents ? arr.concat(p.topLevelComponents) : arr), [])
            .map((Component, idx) => <Component key={idx} />)}
        </div>
      </div>
    );
  }
}
