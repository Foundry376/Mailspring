import React from 'react';
import { Editor } from 'slate';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, SanitizeTransformer } from 'mailspring-exports';
import { ComposerEditorPlugin } from './types';

export const UNEDITABLE_TYPE = 'uneditable';
export const UNEDITABLE_TAGS = ['table', 'img', 'center', 'signature'];

// UneditableNode re-renders on every composer change, but SanitizeTransformer
// has no internal cache and a block's HTML rarely changes, so sanitizing inline
// would run DOMPurify on every keystroke. Memoize by the exact input string —
// the sanitizer is a pure function of (input, static config) — and bound the
// map so a long editing session with many distinct blocks can't grow it without
// limit.
const sanitizeCache = new Map<string, string>();
const SANITIZE_CACHE_MAX = 100;

function sanitizeUneditableHtml(raw: string): string {
  if (!raw) return '';
  const cached = sanitizeCache.get(raw);
  if (cached !== undefined) return cached;
  const clean = SanitizeTransformer.runSync(raw);
  // Map iterates in insertion order, so deleting the first key is FIFO eviction.
  if (sanitizeCache.size >= SANITIZE_CACHE_MAX) {
    sanitizeCache.delete(sanitizeCache.keys().next().value);
  }
  sanitizeCache.set(raw, clean);
  return clean;
}

function UneditableNode(props) {
  const { attributes, node, editor, targetIsHTML, isFocused, children } = props;
  // Sanitize at the rendering boundary rather than trusting data.html. The HTML
  // deserializer sanitizes before storing this value, but a node can also arrive
  // pre-decoded — e.g. a Slate fragment dragged in from untrusted email via
  // data-slate-fragment — which never passes through that deserializer. Because
  // this composer runs with nodeIntegration, an unsanitized <webview>/<img
  // onerror> here would execute with Node access. The result is memoized, so a
  // value that was already cleaned costs a map lookup rather than a DOMPurify run.
  const rawHtml = node.data.get ? node.data.get('html') : node.data.html;
  const __html = sanitizeUneditableHtml(rawHtml);

  if (targetIsHTML) {
    return <div dangerouslySetInnerHTML={{ __html }} />;
  }
  return (
    <div {...attributes} className={`uneditable custom-block ${isFocused && 'focused'}`}>
      <a
        className="uneditable-remove"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          editor.removeNodeByKey(node.key);
        }}
      >
        <RetinaImg
          title={localized('Remove HTML')}
          name="image-cancel-button.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </a>
      <div dangerouslySetInnerHTML={{ __html }} />
      {/* This node below is necessary for selection of the uneditable block, and
      we also put the text content of the HTML in so that copy/paste works nicely. */}
      <div style={{ position: 'absolute', height: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function renderNode(props, editor: Editor = null, next = () => {}) {
  if (props.node.type === UNEDITABLE_TYPE) {
    return UneditableNode(props);
  }
  return next();
}

const rules = [
  {
    deserialize(el: HTMLElement, next: (elements: NodeList) => any) {
      const tagName = el.tagName.toLowerCase();

      if (UNEDITABLE_TAGS.includes(tagName)) {
        // The captured HTML is later re-injected via dangerouslySetInnerHTML in
        // UneditableNode. Because this composer runs in a renderer with nodeIntegration,
        // any preserved <img onerror=...>, <iframe>, or <script> would execute with Node
        // access. Sanitize here so every input path (mailto, paste, drag-drop, programmatic)
        // is covered at the funnel.
        return {
          object: 'block',
          type: UNEDITABLE_TYPE,
          data: {
            html: SanitizeTransformer.runSync(el.outerHTML),
          },
          nodes: [],
        };
      }
    },
    serialize(obj: any, children: any) {
      if (obj.object !== 'block') return;
      return renderNode({ node: obj, children, targetIsHTML: true });
    },
  },
];

const plugins: ComposerEditorPlugin[] = [
  {
    renderNode,
    rules,
  },
];

export default plugins;
