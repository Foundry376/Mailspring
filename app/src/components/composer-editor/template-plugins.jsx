import React from 'react';
import { Inline } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { BuildToggleButton } from './toolbar-component-factories';

export const VARIABLE_TYPE = 'templatevar';

function renderNode({ attributes, node, editor, isSelected }) {
  if (node.type === VARIABLE_TYPE) {
    const name = node.data.name || node.data.get('name');

    return (
      <span
        {...attributes}
        data-tvar={name}
        className={`template-variable ${isSelected && 'selected'}`}
        title={name}
      >
        {name}
      </span>
    );
  }
}

const rules = [
  {
    deserialize(el, next) {
      let name = el.dataset && el.dataset.tvar;
      if (el.tagName === 'CODE' && el.classList.contains('var')) {
        name = '';
      }
      if (name) {
        return {
          object: 'inline',
          type: VARIABLE_TYPE,
          isVoid: true,
          data: { name },
        };
      }
    },
    serialize(obj, children) {
      if (obj.object !== 'inline') return;
      return renderNode({ node: obj, children, targetIsHTML: true });
    },
  },
];

function onKeyDown(event, change, editor) {
  // If the user has a template variable selected and types a character,
  // delete the template variable. By default you just can't type.
  if (
    event.key.length === 1 &&
    change.value.selection.isCollapsed &&
    change.value.inlines.find(i => i.type === VARIABLE_TYPE)
  ) {
    const node = change.value.inlines.find(i => i.type === VARIABLE_TYPE);
    change.removeNodeByKey(node.key);
    return;
  }

  // Tabbing between template variables
  if (event.keyCode === 9) {
    if (!change.value.document.getInlinesByType('templatevar').first()) {
      return;
    }

    // create another temporary change we'll discard - we need to find the "next"
    // inline which is easiest to do if we create a new selection, but this will
    // leave artifacts if we don't find a template node to select.
    const forwards = !event.shiftKey;
    const tmp = change.value.change();

    // avoid re-selecting the current node by just removing it from our temp value
    const current = change.value.inlines.find(i => i.type === VARIABLE_TYPE);
    if (current) {
      tmp.removeNodeByKey(current.key);
    }

    // select the remainder of the document and then find our next template var
    let next = null;
    if (forwards) {
      tmp.collapseToEnd().extendToEndOf(tmp.value.document);
      next = tmp.value.document.getInlinesAtRange(tmp.value.selection, 'templatevar').first();
    } else {
      tmp.collapseToStart().extendToStartOf(tmp.value.document);
      next = tmp.value.document.getInlinesAtRange(tmp.value.selection, 'templatevar').last();
    }

    if (next) {
      change.select({
        anchorKey: next.key,
        anchorOffset: 0,
        focusKey: next.key,
        focusOffset: 0,
        isFocused: true,
        isBackward: false,
      });
    }
  }
}

export default [
  {
    toolbarSectionClass: 'templates hide-in-composer',
    toolbarComponents: [
      BuildToggleButton({
        type: VARIABLE_TYPE,
        button: {
          iconClass: 'fa fa-tag',
          isActive: value => value.inlines.find(i => i.type === VARIABLE_TYPE),
          onToggle: (value, active) => {
            if (active) {
              const node = value.inlines.find(i => i.type === VARIABLE_TYPE);
              return value
                .change()
                .removeNodeByKey(node.key)
                .insertText(node.data.get('name'));
            } else {
              const node = Inline.create({
                type: VARIABLE_TYPE,
                data: { name: value.selection.isCollapsed ? 'variable' : value.fragment.text },
                isVoid: true,
              });
              return value
                .change()
                .insertInlineAtRange(value.selection, node)
                .collapseToEnd();
            }
          },
        },
      }),
    ],
    renderNode,
    rules,
    onKeyDown,
  },
  AutoReplace({
    trigger: '}',
    before: /({{)([^}]+)(})/,
    transform: (transform, e, matches) => {
      const name = matches.before[2];
      const node = Inline.create({
        type: VARIABLE_TYPE,
        data: { name },
        isVoid: true,
      });
      transform.insertInlineAtRange(transform.value.selection, node).collapseToEnd();
    },
  }),
];
