import React from 'react';
import { Editor } from 'slate-react';
import { clipboard as ElectronClipboard } from 'electron';
import path from 'path';
import fs from 'fs';

import { KeyCommandsRegion } from '../key-commands-region';
import ComposerEditorToolbar from './composer-editor-toolbar';
import { plugins, convertFromHTML, convertToHTML } from './conversion';
import { lastUnquotedNode } from './base-block-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

const AEditor = Editor as any;

interface ComposerEditorProps {
  value: any;
  propsForPlugins: any;
  onChange: (change: any) => void;
  className?: string;
  onBlur?: () => void;
  onDrop?: (e: Event) => void;
  onFileReceived?: (path: string) => void;
}

export class ComposerEditor extends React.Component<ComposerEditorProps> {
  // Public API

  _pluginKeyHandlers = {};
  _mounted = false;

  constructor(props) {
    super(props);

    // Bind the commands specified by the plugins to the props of this instance.
    // Note that we cache these between renders so we don't remove and re-add them
    // every render.
    this._pluginKeyHandlers = {};
    plugins.forEach(plugin => {
      if (!plugin.commands) return;
      Object.entries(plugin.commands).forEach(
        ([command, handler]: [string, (event: any, val: any) => any]) => {
          this._pluginKeyHandlers[command] = event => {
            if (!this._mounted) return;
            const { onChange, value } = this.props;
            const change = handler(event, value);
            if (change) {
              onChange(change);
            }
          };
        }
      );
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
        .focus()
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
      const blob = item.getAsFile();
      const ext =
        {
          'image/png': '.png',
          'image/jpg': '.jpg',
          'image/tiff': '.tiff',
        }[item.type] || '';

      const reader = new FileReader();
      reader.addEventListener('loadend', () => {
        const buffer = Buffer.from(new Uint8Array(reader.result as any));
        const tmpFolder = temp.path('-mailspring-attachment');
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
      if (value && value.document) {
        change.insertFragment(value.document);
        return true;
      }
    }
  };

  onContextMenu = event => {
    event.preventDefault();

    const word = this.props.value.fragment.text;
    const sel = this.props.value.selection;
    const hasSelectedText = !sel.isCollapsed;

    AppEnv.windowEventHandler.openSpellingMenuFor(word, hasSelectedText, {
      onCorrect: correction => {
        this.onChange(this.props.value.change().insertText(correction));
      },
      onRestoreSelection: () => {
        this.onChange(this.props.value.change().select(sel));
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
        <ComposerEditorToolbar value={value} onChange={this.onChange} plugins={plugins} />
        <div
          className="RichEditor-content"
          onClick={this.onFocusIfBlurred}
          onContextMenu={this.onContextMenu}
        >
          {plugins
            .filter(p => p.topLevelComponent)
            .map((p, idx) => (
              <p.topLevelComponent key={idx} value={value} onChange={this.onChange} />
            ))}
          <AEditor
            value={value}
            onChange={this.onChange}
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
      </KeyCommandsRegion>
    );
  }
}
