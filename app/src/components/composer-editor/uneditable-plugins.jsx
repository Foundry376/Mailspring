import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';

export const UNEDITABLE_TYPE = 'uneditable';
export const UNEDITABLE_TAGS = ['table', 'img'];

function UneditableNode(props) {
  const { attributes, node, editor, targetIsHTML, isSelected } = props;

  if (targetIsHTML) {
    return <div dangerouslySetInnerHTML={{ __html: node.data.get('html') }} />;
  }
  return (
    <div {...attributes} className={`uneditable ${isSelected && 'custom-block-selected'}`}>
      <a
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          editor.change(change => {
            change.removeNodeByKey(node.key);
          });
        }}
        className="uneditable-remove"
      >
        <RetinaImg
          title="Remove HTML"
          name="image-cancel-button.png"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </a>
      <div dangerouslySetInnerHTML={{ __html: node.data.get('html') }} />
    </div>
  );
}

export function renderNode(props) {
  if (props.node.type === UNEDITABLE_TYPE) {
    return UneditableNode(props);
  }
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
          isVoid: true,
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
