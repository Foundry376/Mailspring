import React from 'react';
import { Editor } from 'slate-react';
import { clipboard as ElectronClipboard } from 'electron';

import KeyCommandsRegion from '../key-commands-region';
import ComposerEditorToolbar from './composer-editor-toolbar';
import { schema, plugins, convertFromHTML, convertToHTML } from './conversion';
import { lastUnquotedNode, removeQuotedText } from './base-block-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

export default class ComposerEditor extends React.Component {
  // Public API

  constructor(props) {
    super(props);

    // Bind the commands specified by the plugins to the props of this instance.
    // Note that we cache these between renders so we don't remove and re-add them
    // every render.
    this._pluginKeyHandlers = {};
    plugins.forEach(plugin => {
      Object.entries(plugin.commands || {}).forEach(([command, handler]) => {
        this._pluginKeyHandlers[command] = event => {
          if (!this._mounted) return;
          handler(event, this.editor);
        };
      });
    });
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  focus = () => {
    this.editor
      .moveToRangeOfDocument()
      .moveToStart()
      .focus();
  };

  focusEndReplyText = () => {
    window.requestAnimationFrame(() => {
      const node = lastUnquotedNode(this.editor.value);
      if (!node) return;
      this.editor.moveToEndOfNode(node).focus();
    });
  };

  focusEndAbsolute = () => {
    window.requestAnimationFrame(() => {
      this.editor
        .moveToRangeOfDocument()
        .moveToEnd()
        .focus();
    });
  };

  removeQuotedText = () => {
    removeQuotedText(this.editor);
  };

  insertInlineAttachment = file => {
    InlineAttachmentChanges.insert(this.editor, file);
  };

  onFocusIfBlurred = event => {
    if (!this.props.value.selection.isFocused) {
      this.focus();
    }
  };

  onCopy = (event, editor, next) => {
    event.preventDefault();
    const document = editor.value.document.getFragmentAtRange(editor.value.selection);
    event.clipboardData.setData('text/html', convertToHTML({ document }));
    event.clipboardData.setData('text/plain', editor.value.fragment.text);
  };

  onCut = (event, editor, next) => {
    this.onCopy(event, editor, next);
    editor.deleteBackward();
  };

  onPaste = (event, editor, next) => {
    const { onFileReceived } = this.props;

    if (!onFileReceived || event.clipboardData.items.length === 0) {
      return next();
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
      return;
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
        return;
      }
    }

    // handle text/html paste
    const html = event.clipboardData.getData('text/html');
    if (html) {
      const value = convertFromHTML(html);
      if (value && value.document) {
        editor.insertFragment(value.document);
        return;
      }
    }

    next();
  };

  onContextMenu = event => {
    event.preventDefault();

    const word = this.props.value.fragment.text;
    const sel = this.props.value.selection;
    const hasSelectedText = !sel.isCollapsed;

    AppEnv.windowEventHandler.openSpellingMenuFor(word, hasSelectedText, {
      onCorrect: correction => {
        this.editor.insertText(correction);
      },
      onRestoreSelection: () => {
        this.editor.select(sel);
      },
    });
  };

  onChange = nextValue => {
    // This needs to be here because some composer plugins defer their calls to onChange
    // (like spellcheck and the context menu).
    if (!this._mounted) return;
    this.props.onChange(nextValue);
  };

  // Event Handlers
  render() {
    const { className, onBlur, onDrop, value, propsForPlugins } = this.props;

    return (
      <KeyCommandsRegion
        className={`RichEditor-root ${className || ''}`}
        localHandlers={this._pluginKeyHandlers}
      >
        {/* {this.editor && (
          <ComposerEditorToolbar editor={this.editor} value={value} plugins={plugins} />
        )} */}
        <div
          className="RichEditor-content"
          onClick={this.onFocusIfBlurred}
          onContextMenu={this.onContextMenu}
        >
          {/* {this.editor &&
            plugins
              .filter(p => p.topLevelComponent)
              .map((p, idx) => (
                <p.topLevelComponent key={idx} editor={this.editor} value={value} />
              ))} */}
          <Editor
            ref={editor => (this.editor = editor)}
            value={value}
            onChange={this.onChange}
            onBlur={onBlur}
            onDrop={onDrop}
            onCut={this.onCut}
            onCopy={this.onCopy}
            onPaste={this.onPaste}
            spellCheck={false}
            schema={schema}
            plugins={plugins}
            propsForPlugins={propsForPlugins}
          />
          {/* {plugins
            .reduce((arr, p) => (p.topLevelComponents ? arr.concat(p.topLevelComponents) : arr), [])
            .map((Component, idx) => <Component key={idx} />)} */}
        </div>
      </KeyCommandsRegion>
    );
  }
}
