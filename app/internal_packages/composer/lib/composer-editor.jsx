import React from 'react';
import { Editor, RichUtils, AtomicBlockUtils, EditorState } from 'draft-js';

import ComposerEditorToolbar from './composer-editor-toolbar';
import InlineImageUploadContainer from './inline-image-upload-container';
import { decorator, blockStyleFn, customStyleFn } from './draftjs-config';

export default class ComposerEditor extends React.Component {
  componentDidMount() {
    // attach the decorators we use to EditorState
    this.props.onChange(EditorState.set(this.props.editorState, { decorator }));
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

  blockRenderer = block => {
    const Image = props => {
      const entity = props.contentState.getEntity(props.block.getEntityAt(0));
      const { fileId } = entity.getData();
      // const type = entity.getType();
      return (
        <InlineImageUploadContainer
          {...this.props.atomicBlockProps}
          fileId={fileId}
          isPreview={false}
        />
      );
    };

    if (block.getType() === 'atomic') {
      return {
        component: Image,
        editable: false,
      };
    }
    return null;
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
        />
        <div className={className} onClick={this.focus}>
          <Editor
            ref={el => (this._editorComponent = el)}
            blockRendererFn={this.blockRenderer}
            blockStyleFn={blockStyleFn}
            customStyleFn={customStyleFn}
            handleKeyCommand={this.onHandleKeyCommand}
            handlePastedFiles={this.onPastedFiles}
            editorState={editorState}
            onChange={onChange}
            onTab={this.onTab}
            spellCheck
          />
        </div>
      </div>
    );
  }
}
