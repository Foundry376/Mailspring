import React from 'react';
import { Editor } from 'slate-react';
import { clipboard as ElectronClipboard } from 'electron';

import ComposerEditorToolbar from './composer-editor-toolbar';
import { plugins, convertFromHTML, convertToHTML } from './conversion';
import { lastUnquotedNode } from './base-block-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

export default class ComposerEditor extends React.Component {
  // Public API

  focus = () => {
    const { onChange, value } = this.props;
    onChange(
      value
        .change()
        .selectAll()
        .collapseToStart()
        .focus()
    );
  };

  focusEndReplyText = () => {
    window.requestAnimationFrame(() => {
      const { onChange, value } = this.props;
      onChange(
        value
          .change()
          .collapseToEndOf(lastUnquotedNode(value))
          .focus()
      );
    });
  };

  focusEndAbsolute = () => {
    window.requestAnimationFrame(() => {
      const { onChange, value } = this.props;
      onChange(
        value
          .change()
          .selectAll()
          .collapseToEnd()
          .focus()
      );
    });
  };

  insertInlineAttachment = file => {
    const { onChange, value } = this.props;
    onChange(InlineAttachmentChanges.insert(value.change(), file));
  };

  onFocusIfBlurred = event => {
    if (!this.props.value.selection.isFocused) {
      this.focus();
    }
  };

  onCopy = (event, change, editor) => {
    event.preventDefault();
    const document = editor.value.document.getFragmentAtRange(editor.value.selection);
    event.clipboardData.setData('text/html', convertToHTML({ document }));
    return true;
  };

  onCut = (event, change, editor) => {
    this.onCopy(event, change, editor);
    change.deleteBackward();
    return true;
  };

  onPaste = (event, change, editor) => {
    const { onFileReceived } = this.props;

    if (!onFileReceived || event.clipboardData.items.length === 0) {
      return;
    }
    event.preventDefault();

    // If the pasteboard has a file on it, stream it to a teporary
    // file and fire our `onFilePaste` event.
    const item = event.clipboardData.items[0];

    if (item.kind === 'file') {
      const temp = require('temp');
      const path = require('path');
      const fs = require('fs');
      const blob = item.getAsFile();
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
            onFileReceived(tmpPath);
          });
        });
      });
      reader.readAsArrayBuffer(blob);
      return true;
    } else {
      const macCopiedFile = decodeURI(
        ElectronClipboard.read('public.file-url').replace('file://', '')
      );
      const winCopiedFile = ElectronClipboard.read('FileNameW').replace(
        new RegExp(String.fromCharCode(0), 'g'),
        ''
      );
      if (macCopiedFile.length || winCopiedFile.length) {
        onFileReceived(macCopiedFile || winCopiedFile);
        return true;
      }
    }

    // handle text/html paste
    const html = event.clipboardData.getData('text/html');
    if (html) {
      const value = convertFromHTML(html);
      change.insertFragment(value.document);
      return true;
    }
  };

  // Event Handlers
  render() {
    const { className, onChange, onBlur, onDrop, value, propsForPlugins } = this.props;
    const spellCheck = AppEnv.config.get('core.composing.spellcheck');

    return (
      <div className="RichEditor-root">
        <ComposerEditorToolbar value={value} onChange={onChange} plugins={plugins} />
        <div className={className} onClick={this.onFocusIfBlurred}>
          <Editor
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onDrop={onDrop}
            onCut={this.onCut}
            onCopy={this.onCopy}
            onPaste={this.onPaste}
            spellCheck={false}
            plugins={plugins}
            propsForPlugins={propsForPlugins}
          />
          {plugins
            .reduce((arr, p) => (p.topLevelComponents ? arr.concat(p.topLevelComponents) : arr), [])
            .map((Component, idx) => <Component key={idx} />)}
        </div>
      </div>
    );
  }
}
