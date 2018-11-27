import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

export const UNEDITABLE_TYPE = 'uneditable';
export const UNEDITABLE_TAGS = ['table', 'img', 'center', 'signature'];

function UneditableNode(props) {
  const { attributes, node, editor, targetIsHTML, isSelected, children } = props;
  const __html = node.data.get ? node.data.get('html') : node.data.html;

  if (targetIsHTML) {
    return <div dangerouslySetInnerHTML={{ __html }} />;
  }
  return (
    <div {...attributes} className={`uneditable ${isSelected && 'custom-block-selected'}`}>
      <div style={{ position: 'absolute', height: 0 }}>{children}</div>
      <a
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          editor.removeNodeByKey(node.key);
        }}
        className="uneditable-remove"
      >
        <RetinaImg
          title={localized('Remove HTML')}
          name="image-cancel-button.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </a>
      <div dangerouslySetInnerHTML={{ __html }} />
    </div>
  );
}

function renderNode(props, editor = null, next = () => {}) {
  if (props.node.type === UNEDITABLE_TYPE) {
    return UneditableNode(props);
  }

  return next();
}

const rules = [
  {
    deserialize(el, next) {
      const tagName = el.tagName.toLowerCase();

      if (UNEDITABLE_TAGS.includes(tagName)) {
        return {
          object: 'block',
          type: UNEDITABLE_TYPE,
          data: { html: el.outerHTML },
          nodes: [],
        };
      }
    },
    serialize(obj, children) {
      if (obj.object !== 'block') return;
      return renderNode({ node: obj, children, targetIsHTML: true });
    },
  },
];

export default [
  {
    renderNode,
    rules,
  },
];
