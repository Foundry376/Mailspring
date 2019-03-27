import React from 'react';
import { Inline, Editor } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { BuildToggleButton } from './toolbar-component-factories';
import { ComposerEditorPlugin } from './types';

export const VARIABLE_TYPE = 'templatevar';

function renderNode(
  {
    attributes,
    node,
    children,
    isSelected,
    targetIsHTML,
  }: {
    attributes?: any;
    node: any;
    children: any;
    isSelected?: boolean;
    targetIsHTML: boolean;
  },
  editor = null,
  next = () => {}
) {
  if (node.type === VARIABLE_TYPE) {
    const name = node.data.name || node.data.get('name');

    return (
      <span
        {...attributes}
        data-tvar={name}
        className={`template-variable ${isSelected && 'selected'}`}
        contentEditable={false}
        title={name}
      >
        {name}
      </span>
    );
  }
  return next();
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

function onKeyDown(event, editor: Editor, next: () => void) {
  // If the user has a template variable selected and types a character,
  // delete the template variable. By default you just can't type.
  if (
    event.key.length === 1 &&
    editor.value.selection.isCollapsed &&
    editor.value.inlines.find(i => i.type === VARIABLE_TYPE)
  ) {
    const node = editor.value.inlines.find(i => i.type === VARIABLE_TYPE);
    editor.removeNodeByKey(node.key);
    return next();
  }

  // Tabbing between template variables
  if (event.keyCode === 9) {
    if (!editor.value.document.getInlinesByType(VARIABLE_TYPE).first()) {
      return next();
    }

    // create another temporary change we'll discard - we need to find the "next"
    // inline which is easiest to do if we create a new selection, but this will
    // leave artifacts if we don't find a template node to select.
    const forwards = !event.shiftKey;
    const current = editor.value.inlines.find(i => i.type === VARIABLE_TYPE);
    const oldSelection = editor.value.selection;

    // select the remainder of the document and then find our next template var
    let nextvar = null;
    if (forwards) {
      editor.moveFocusToEndOfNode(editor.value.document);
      let inlines = (editor.value.document as any)
        .getLeafInlinesAtRange(editor.value.selection)
        .toArray()
        .filter(i => i.type === VARIABLE_TYPE);
      if (current) {
        inlines = inlines.slice(inlines.indexOf(current) + 1);
      }
      nextvar = inlines[0];
    } else {
      editor.moveFocusToStartOfNode(editor.value.document);
      let inlines = (editor.value.document as any)
        .getLeafInlinesAtRange(editor.value.selection)
        .toArray()
        .filter(i => i.type === VARIABLE_TYPE);
      if (current) {
        inlines = inlines.slice(0, inlines.indexOf(current));
      }
      nextvar = inlines.pop();
    }

    if (nextvar) {
      editor.moveToRangeOfNode(nextvar.nodes.first()).focus();
      event.preventDefault();
      return;
    } else {
      editor.select(oldSelection);
    }
  }
  return next();
}

const plugins: ComposerEditorPlugin[] = [
  {
    toolbarSectionClass: 'templates hide-in-composer',
    toolbarComponents: [
      BuildToggleButton({
        type: VARIABLE_TYPE,
        button: {
          iconClass: 'fa fa-tag',
          isActive: value => !!value.inlines.find(i => i.type === VARIABLE_TYPE),
          onToggle: (editor: Editor, active) => {
            if (active) {
              const node = editor.value.inlines.find(i => i.type === VARIABLE_TYPE);
              return editor.removeNodeByKey(node.key).insertText(node.data.get('name'));
            } else {
              const node = Inline.create({
                type: VARIABLE_TYPE,
                data: {
                  name: editor.value.selection.isCollapsed
                    ? 'variable'
                    : editor.value.fragment.text,
                },
              } as any);
              return editor.insertInlineAtRange(editor.value.selection as any, node).moveToEnd();
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
    change: (editor: Editor, e, matches) => {
      const name = matches.before[2];
      const node = Inline.create({
        type: VARIABLE_TYPE,
        data: { name },
      } as any);
      editor.insertInlineAtRange(editor.value.selection as any, node).moveToEnd();
    },
  }),
];

export default plugins;
