import React from 'react';
import PropTypes from 'prop-types';
import { Editor } from '../slate-react';
import { clipboard as ElectronClipboard } from 'electron';

import KeyCommandsRegion from '../key-commands-region';
import ComposerEditorToolbar from './composer-editor-toolbar';
import { plugins, convertFromHTML, convertToHTML } from './conversion';
import { lastUnquotedNode } from './base-block-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

export default class ComposerEditor extends React.Component {
  static propTypes = {
    readOnly: PropTypes.bool,
  };
  static defaultProps = {
    readOnly: false,
  };

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
          const { onChange, value } = this.props;
          const change = handler(event, value);
          if (change) {
            onChange(change);
          }
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
    const { onChange, value } = this.props;
    onChange(
      value
        .change()
        .selectAll()
        .collapseToStart()
        .focus(),
    );
  };

  focusEndReplyText = () => {
    window.requestAnimationFrame(() => {
      const { onChange, value } = this.props;
      const node = lastUnquotedNode(value);
      if (!node) return;
      onChange(
        value
          .change()
          .collapseToEndOf(node)
          .focus(),
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
          .focus(),
      );
    });
  };

  insertInlineAttachments = files => {
    if (!Array.isArray(files) || files.length === 0) {
      return;
    }
    const { onChange, value } = this.props;
    let change = value.change();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      InlineAttachmentChanges.insert(change, file);
      if(i!==files.length -1){
        change.collapseToEndOfPreviousText();
      }
    }
    // DC-734 it seems that if we call onChange immediately, more often than not,
    // it'll effect the next "list" item and make it indent.
    // For some reason adding a timeout solves this problem.
    setTimeout(()=>onChange(change), 500);
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
    event.clipboardData.setData('text/plain', editor.value.fragment.text);
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
        const buffer = Buffer.from(new Uint8Array(reader.result));
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
        ElectronClipboard.read('public.file-url').replace('file://', ''),
      );
      const winCopiedFile = ElectronClipboard.read('FileNameW').replace(
        new RegExp(String.fromCharCode(0), 'g'),
        '',
      );
      if (macCopiedFile.length || winCopiedFile.length) {
        onFileReceived(macCopiedFile || winCopiedFile);
        return true;
      }
    }

    // Reinstated because the bug is causing more trouble than it's worth.
    const html = event.clipboardData.getData('text/html');
    if (html) {
      const value = convertFromHTML(html);
      if (value && value.document) {
        change.insertFragment(value.document);
        return true;
      }
    }
  };

  openContextMenu = ({ word, sel, hasSelectedText }) => {
    AppEnv.windowEventHandler.openSpellingMenuFor(word, hasSelectedText, {
      onCorrect: correction => {
        this.onChange(this.props.value.change().insertText(correction));
      },
      onRestoreSelection: () => {
        this.onChange(this.props.value.change().select(sel));
      },
    });
  };

  onContextMenu = event => {
    event.preventDefault();

    const word = this.props.value.fragment.text;
    const sel = this.props.value.selection;
    const hasSelectedText = !sel.isCollapsed;
    this.openContextMenu({ word, sel, hasSelectedText });
  };

  onChange = nextValue => {
    // This needs to be here because some composer plugins defer their calls to onChange
    // (like spellcheck and the context menu).
    if (!this._mounted) return;
    // console.log('sending out changes');
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
        <ComposerEditorToolbar value={value} onChange={this.onChange} plugins={plugins} readOnly={this.props.readOnly} isCrowded={this.props.isCrowded}/>
        <div
          className="RichEditor-content"
          onClick={this.onFocusIfBlurred}
          onContextMenu={this.onContextMenu}
        >
          {plugins
            .filter(p => p.topLevelComponent)
            .map((p, idx) => (
              <p.topLevelComponent key={idx} value={value} onChange={this.onChange}/>
            ))}
          <Editor
            value={value}
            onChange={this.onChange}
            onBlur={onBlur}
            onDrop={onDrop}
            onCut={this.onCut}
            onCopy={this.onCopy}
            onPaste={this.onPaste}
            spellCheck={false}
            readOnly={this.props.readOnly}
            plugins={plugins}
            propsForPlugins={propsForPlugins}
          />
          {plugins
            .reduce((arr, p) => (p.topLevelComponents ? arr.concat(p.topLevelComponents) : arr), [])
            .map((Component, idx) => <Component key={idx}/>)}
        </div>
      </KeyCommandsRegion>
    );
  }
}
