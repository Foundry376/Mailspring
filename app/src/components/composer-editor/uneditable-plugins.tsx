import React from 'react';
import { Editor } from 'slate';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, SanitizeTransformer } from 'mailspring-exports';
import { ComposerEditorPlugin } from './types';

export const UNEDITABLE_TYPE = 'uneditable';
export const UNEDITABLE_TAGS = ['table', 'img', 'center', 'signature'];

function UneditableNode(props) {
  const { attributes, node, editor, targetIsHTML, isFocused, children } = props;
  const __html = node.data.get ? node.data.get('html') : node.data.html;

  if (targetIsHTML) {
    return <div dangerouslySetInnerHTML={{ __html }} />;
  }
  return (
    <div {...attributes} className={`uneditable custom-block ${isFocused && 'focused'}`}>
      <a
        className="uneditable-remove"
        onClick={e => {
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
