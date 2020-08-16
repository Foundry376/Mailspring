import React from 'react';
import ReactDOM from 'react-dom';
import * as Immutable from 'immutable';
import { Editor, Value, Operation, Range } from 'slate';
import { Editor as SlateEditorComponent, EditorProps } from 'slate-react';
import { clipboard as ElectronClipboard } from 'electron';
import { InlineStyleTransformer } from 'mailspring-exports';
import path from 'path';
import fs from 'fs';

import { KeyCommandsRegion } from '../key-commands-region';
import ComposerEditorToolbar from './composer-editor-toolbar';
import { schema, plugins, convertFromHTML, convertToHTML, convertToPlainText } from './conversion';
import { lastUnquotedNode, removeQuotedText } from './base-block-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

const AEditor = (SlateEditorComponent as any) as React.ComponentType<
  EditorProps & { ref: any; propsForPlugins: any }
>;

interface ComposerEditorProps {
  value: Value;
  propsForPlugins: any;
  onChange: (change: { operations: Immutable.List<Operation>; value: Value }) => void;
  className?: string;
  onBlur?: (e: React.FocusEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onFileReceived?: (path: string) => void;
  onUpdatedSlateEditor?: (editor: Editor | null) => void;
}

export class ComposerEditor extends React.Component<ComposerEditorProps> {
  // Public API

  _pluginKeyHandlers = {};
  _mounted = false;
  editor: Editor | null = null;

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
            handler(event, this.editor);
          };
        }
      );
    });
  }

  componentDidMount() {
    this._mounted = true;
    this.props.onUpdatedSlateEditor && this.props.onUpdatedSlateEditor(this.editor);

    // This is a bit of a hack. The toolbar requires access to the Editor model,
    // which IS the Editor component in `slate-react`. It seems silly to copy a ref
    // into state, but we need to re-render once after mount when we have it.
    this.forceUpdate();
  }

  componentWillUnmount() {
    this._mounted = false;
    this.props.onUpdatedSlateEditor && this.props.onUpdatedSlateEditor(null);

    // We need to explicitly blur the editor so that it saves a new selection (null)
    // and doesn't try to restore the selection / steal focus when you navigate to
    // the thread again.

    const editorEl = ReactDOM.findDOMNode(this.editor as any);
    if (editorEl && editorEl.contains(document.getSelection().anchorNode)) {
      this.props.onChange({
        operations: Immutable.List([]),
        value: this.editor.deselect().blur().value,
      });
    }
  }

  focus = () => {
    this.editor
      .focus()
      .moveToRangeOfDocument()
      .moveToStart();
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

  onCopy = (event, editor: Editor, next: () => void) => {
    const sel = document.getSelection();

    // copying within an uneditable region of the composer (eg: quoted HTML email)
    // is handled by the browser on it's own. We only need to copy the Slate
    // value if the selection is in the editable region.
    const entirelyWithinUneditable =
      sel.anchorNode.parentElement.closest('.uneditable') &&
      sel.focusNode.parentElement.closest('.uneditable');
    if (entirelyWithinUneditable) return;

    event.preventDefault();

    const range = (editor.value.selection as any) as Range;
    const fragment = editor.value.document.getFragmentAtRange(range);
    const value = Value.create({ document: fragment });
    const text = convertToPlainText(value);
    if (text) {
      event.clipboardData.setData('text/html', convertToHTML(value));
      event.clipboardData.setData('text/plain', text);
    } else {
      // Don't blow away the current contents of the user's clipboard if the
      // current editor selection has no text at all.
    }

    // Allow slate to attach it's own data, which it can use to paste nicely
    // if the paste target is the editor.
    next();
  };

  onCut = (event, editor: Editor, next: () => void) => {
    this.onCopy(event, editor, next);

    // Allow slate to attach it's own data, which it can use to paste nicely
    // if the paste target is the editor. Note: Slate also cuts the selection.
    next();
  };

  onPaste = (event, editor: Editor, next: () => void) => {
    const { onFileReceived } = this.props;

    // If the copy event originated in the editor, let Slate handle the paste
    // rather than falling back to text+html deserialization.
    if (event.clipboardData.types.includes('application/x-slate-fragment')) {
      return next();
    }

    if (onFileReceived && event.clipboardData.items.length > 0) {
      event.preventDefault();
      if (handleFilePasted(event, onFileReceived)) {
        return;
      }
    }

    let html = event.clipboardData.getData('text/html');

    if (html) {
      // Unfortuantely, pasting HTML requires an synchronous hop through our main process style
      // transfomer. This ensures that we inline styles and preserve as much as possible.
      // (eg: pasting tables from Excel).
      try {
        html = InlineStyleTransformer.runSync(html);
      } catch (err) {
        //no-op
      }
      const value = convertFromHTML(html);
      if (value && value.document) {
        editor.insertFragment(value.document);
        event.preventDefault();
        return;
      }
    }

    // fall back to Slate's default behavior
    return next();
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

  onChange = (change: { operations: Immutable.List<Operation>; value: Value }) => {
    // This needs to be here because some composer plugins defer their calls to onChange
    // (like spellcheck and the context menu).
    if (!this._mounted) return;
    this.props.onChange(change);
  };

  // Event Handlers
  render() {
    const { className, onBlur, onDrop, value, propsForPlugins } = this.props;

    const PluginTopComponents = this.editor ? plugins.filter(p => p.topLevelComponent) : [];

    return (
      <KeyCommandsRegion
        className={`RichEditor-root ${className || ''}`}
        localHandlers={this._pluginKeyHandlers}
      >
        {this.editor && (
          <ComposerEditorToolbar editor={this.editor} plugins={plugins} value={value} />
        )}
        <div
          className="RichEditor-content"
          onClick={this.onFocusIfBlurred}
          onContextMenu={this.onContextMenu}
        >
          {this.editor &&
            PluginTopComponents.map((p, idx) => (
              <p.topLevelComponent key={idx} value={value} editor={this.editor} />
            ))}
          <AEditor
            ref={editor => (this.editor = editor)}
            schema={schema}
            value={value}
            onChange={this.onChange}
            onBlur={(e: any, editor, next) => {
              if (onBlur) onBlur(e as React.FocusEvent<any>);
              if (!e.isPropagationStopped()) next();
            }}
            onDrop={(e: any, editor, next) => {
              if (onDrop) onDrop(e as React.DragEvent<any>);
              if (!e.isPropagationStopped()) next();
            }}
            onCut={this.onCut}
            onCopy={this.onCopy}
            onPaste={this.onPaste}
            spellCheck={false}
            plugins={plugins}
            propsForPlugins={propsForPlugins}
          />
        </div>
      </KeyCommandsRegion>
    );
  }
}

// Helpers

export function handleFilePasted(event: ClipboardEvent, onFileReceived: (path: string) => void) {
  if (event.clipboardData.items.length === 0) {
    return false;
  }
  // See https://github.com/Foundry376/Mailspring/pull/2104 - if you right-click + Copy Image in Chrome,
  // the image file is item 1, not item 0. We want to prefer the files whenever one is present.
  for (const i in event.clipboardData.items) {
    const item = event.clipboardData.items[i];
    // If the pasteboard has a file on it, stream it to a temporary
    // file and fire our `onFilePaste` event.
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
    }
  }

  const macCopiedFile = decodeURI(ElectronClipboard.read('public.file-url').replace('file://', ''));
  const winCopiedFile = ElectronClipboard.read('FileNameW').replace(
    new RegExp(String.fromCharCode(0), 'g'),
    ''
  );
  const xdgCopiedFiles = (
    (ElectronClipboard.read('text/uri-list') || '')
      .split('\r\n') // yes, really
      .filter(path => path.startsWith('file://'))
      .map(path => path.replace('file://', ''))
      .filter(path => path.length)
  )
  if (macCopiedFile.length || winCopiedFile.length) {
    onFileReceived(macCopiedFile || winCopiedFile);
    return true;
  }
  if (xdgCopiedFiles.length) {
    xdgCopiedFiles.forEach(onFileReceived);
    return true;
  }

  return false;
}
