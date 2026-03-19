import React from 'react';
import ReactDOM from 'react-dom';
import * as Immutable from 'immutable';
import { Editor, Value, Operation, Range, Block, Text } from 'slate';
import { Editor as SlateEditorComponent, EditorProps, Plugin } from 'slate-react';
import { clipboard as ElectronClipboard } from 'electron';
import { InlineStyleTransformer } from 'mailspring-exports';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { debounce } from 'underscore';

import { KeyCommandsRegion } from '../key-commands-region';
import ComposerEditorToolbar from './composer-editor-toolbar';
import { schema, plugins, convertFromHTML, convertToHTML, convertToPlainText } from './conversion';
import { lastUnquotedNode, removeQuotedText, isQuoteNode } from './base-block-plugins';
import { UNEDITABLE_TYPE } from './uneditable-plugins';
import { changes as InlineAttachmentChanges } from './inline-attachment-plugins';

// Returns a reason string if the document needs recovery, or null if it's fine.
function getDocumentBrokenReason(value: Value): string | null {
  const { document } = value;
  const firstText = document.getFirstText();

  // Case 1: no text nodes at all (e.g. user deleted all content before schema normalization ran)
  if (!firstText) {
    return 'document has no text nodes';
  }

  // Case 2: every text node is inside quoted or uneditable content (e.g. user deleted all
  // their own text and only the collapsed quoted-text blockquote remains). Placing the cursor
  // inside those nodes would land in hidden/read-only content.
  const ancestors = document.getAncestors(firstText.key);
  if (ancestors.some(a => a.object === 'block' && (isQuoteNode(a) || a.type === UNEDITABLE_TYPE))) {
    return 'first text node is inside quoted/uneditable content';
  }

  return null;
}

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

interface ComposerEditorState {
  isTyping: boolean;
}

export class ComposerEditor extends React.Component<ComposerEditorProps, ComposerEditorState> {
  // Public API

  _pluginKeyHandlers = {};
  _mounted = false;
  editor: Editor | null = null;
  state: ComposerEditorState = { isTyping: false };

  _onDoneTyping = debounce(() => {
    if (this._mounted) {
      this.setState({ isTyping: false });
    }
  }, 800);

  constructor(props) {
    super(props);

    // Bind the commands specified by the plugins to the props of this instance.
    // Note that we cache these between renders so we don't remove and re-add them
    // every render.
    this._pluginKeyHandlers = {};
    plugins.forEach(plugin => {
      if (!plugin.appCommands) return;
      Object.entries(plugin.appCommands).forEach(
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

  onKeyDown = (event, editor: Editor, next: () => void) => {
    // When the user types, disable spellcheck to avoid performance issues.
    // After they stop typing for 800ms, re-enable it.
    //
    // IMPORTANT: We use requestAnimationFrame to defer the setState call because
    // changing the spellCheck attribute on a contenteditable element synchronously
    // during a key event can cause Chromium to lose focus or interfere with event
    // processing, resulting in "swallowed" keystrokes (especially Enter and Backspace).
    // By deferring to the next frame, we ensure the key event is fully processed
    // before React re-renders and changes the spellCheck attribute.
    //
    // Navigation keys (Home, End, arrow keys, etc.) do not produce text and do not
    // benefit from disabling spellcheck. More importantly, toggling spellCheck on a
    // contenteditable causes Chromium to reset the cursor/selection, which means the
    // first Home/End press after 800ms of inactivity would be "eaten" by the spellCheck
    // re-render. We skip the isTyping transition for these keys to avoid that.
    const isNavigationKey = [
      'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'PageUp', 'PageDown',
    ].includes(event.key);
    if (!isNavigationKey && !this.state.isTyping) {
      requestAnimationFrame(() => {
        if (this._mounted && !this.state.isTyping) {
          this.setState({ isTyping: true });
        }
      });
    }
    if (!isNavigationKey) {
      this._onDoneTyping();
    }
    return next();
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

  onChange = (change: { operations: Immutable.List<Operation>; value: Value }) => {
    // This needs to be here because some composer plugins defer their calls to onChange
    // (like spellcheck and the context menu).
    if (!this._mounted) return;

    // If the incoming value is broken, apply the recovery operation directly to
    // change.value before forwarding to the parent. This emits a single onChange with
    // the already-corrected value rather than emitting the broken value and then a
    // second onChange from a deferred microtask (which is what would happen if we called
    // editor.insertNodeByPath here). The parent therefore never sees the broken state,
    // and the insert_node operation is included in the operations list so the parent
    // knows the document changed and doesn't skip saving.
    const reason = getDocumentBrokenReason(change.value);
    if (reason) {
      console.warn(`ComposerEditor: ${reason}, inserting empty paragraph to recover.`);
      const op = require('slate').Operation.create({
        type: 'insert_node',
        path: Immutable.List([0]),
        node: Block.create({ type: 'div', nodes: Immutable.List([Text.create('')]) }),
      });
      this.props.onChange({
        operations: change.operations.push(op),
        value: op.apply(change.value),
      });
      return;
    }

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
        <div className="RichEditor-content" onClick={this.onFocusIfBlurred}>
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
            onKeyDown={this.onKeyDown as any}
            onCut={this.onCut as any}
            onCopy={this.onCopy as any}
            onPaste={this.onPaste as any}
            spellCheck={!this.state.isTyping && AppEnv.config.get('core.composing.spellcheck')}
            plugins={(plugins as any) as Plugin[]}
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
        const tmpFolder = path.join(os.tmpdir(), `-mailspring-attachment-${crypto.randomUUID()}`);
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
  const xdgCopiedFiles = (ElectronClipboard.read('text/uri-list') || '')
    .split('\r\n') // yes, really
    .filter(path => path.startsWith('file://'))
    .map(path => path.replace('file://', ''))
    .filter(path => path.length);
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
