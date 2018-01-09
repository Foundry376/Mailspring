import React from 'react';
import { Mark } from 'slate';
import AutoReplace from 'slate-auto-replace';

import { BuildMarkButtonWithValuePicker } from './toolbar-component-factories';

const VARIABLE_TYPE = 'templatevar';

function renderMark({ mark, children, editor }) {
  if (mark.type === VARIABLE_TYPE) {
    const name = mark.data.name || mark.data.get('name');
    const onClick = e => {
      if (editor.value.selection.isCollapsed) {
        e.preventDefault();
        const sel = document.getSelection();
        const range = document.createRange();
        range.selectNode(e.target);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };

    return (
      <span
        onClick={onClick}
        data-tvar={name}
        className="template-variable"
        title={name}
        spellCheck={false}
      >
        {children}
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
          object: 'mark',
          type: VARIABLE_TYPE,
          nodes: next(el.childNodes),
          data: { name },
        };
      }
    },
    serialize(obj, children) {
      if (obj.object !== 'mark') return;
      return renderMark({ mark: obj, children, targetIsHTML: true });
    },
  },
];

const TriggerKeyValues = {
  ' ': ' ',
  Enter: '\n',
  Return: '\n',
};

export default [
  {
    toolbarComponents: [
      BuildMarkButtonWithValuePicker({
        type: VARIABLE_TYPE,
        field: 'name',
        iconClassOn: 'fa fa-tag',
        iconClassOff: 'fa fa-tag',
        placeholder: 'first_name',
      }),
    ],
    renderMark,
    rules,
  },
  AutoReplace({
    trigger: '}',
    before: /({{)([^}]+)(})/,
    transform: (transform, e, matches) => {
      if (transform.value.activeMarks.find(m => m.type === VARIABLE_TYPE))
        return transform.insertText(TriggerKeyValues[e.key]);

      const name = matches.before[2];
      const mark = Mark.create({ type: VARIABLE_TYPE, data: { name } });
      return transform
        .addMark(mark)
        .insertText(name)
        .removeMark(mark);
    },
  }),
];
