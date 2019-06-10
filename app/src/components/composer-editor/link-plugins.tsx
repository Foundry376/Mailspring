import React from 'react';

import { Mark, Editor } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { RegExpUtils } from 'mailspring-exports';

import { BuildMarkButtonWithValuePicker } from './toolbar-component-factories';
import { ComposerEditorPlugin } from './types';

export const LINK_TYPE = 'link';

function onPaste(event, editor: Editor, next: () => void) {
  const html = event.clipboardData.getData('text/html');
  const plain = event.clipboardData.getData('text/plain');
  const regex = RegExpUtils.urlRegex({ matchStartOfString: true, matchTailOfString: true });
  if (!html && plain && plain.match(regex)) {
    const mark = Mark.create({ type: LINK_TYPE, data: { href: plain } });
    editor
      .addMark(mark)
      .insertText(plain)
      .removeMark(mark);
  } else {
    return next();
  }
}

function buildAutoReplaceHandler({ hrefPrefix = '' } = {}) {
  return function(editor: Editor, e, matches) {
    if (editor.value.activeMarks.find(m => m.type === LINK_TYPE))
      return editor.insertText(TriggerKeyValues[e.key]);

    const link = matches.before[0];
    const mark = Mark.create({ type: LINK_TYPE, data: { href: hrefPrefix + matches.before[0] } });
    return editor
      .deleteBackward(link.length)
      .addMark(mark)
      .insertText(link)
      .removeMark(mark)
      .insertText(TriggerKeyValues[e.key]);
  };
}

function renderMark({ mark, children, targetIsHTML }, editor = null, next = () => {}) {
  if (mark.type !== LINK_TYPE) {
    return next();
  }
  const href = mark.data.href || mark.data.get('href');
  if (targetIsHTML) {
    return (
      <a href={href} title={href}>
        {children}
      </a>
    );
  } else {
    const onClick = e => {
      if (e.ctrlKey || e.metaKey) {
        AppEnv.windowEventHandler.openLink({ href, metaKey: e.metaKey });
      }
    };
    return (
      <span className="link" title={href} onClick={onClick}>
        {children}
      </span>
    );
  }
}

const rules = [
  {
    deserialize(el, next) {
      if (el.tagName.toLowerCase() === 'a') {
        return {
          object: 'mark',
          type: LINK_TYPE,
          nodes: next(el.childNodes),
          data: {
            href: el.getAttribute('href'),
          },
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

const BaseLinkPlugin: ComposerEditorPlugin = {
  toolbarComponents: [
    BuildMarkButtonWithValuePicker({
      type: LINK_TYPE,
      field: 'href',
      iconClassOn: 'fa fa-link',
      iconClassOff: 'fa fa-link',
      placeholder: 'http://',
    }),
  ],
  onPaste,
  onKeyDown: function onKeyDown(event, editor: Editor, next: () => void) {
    // ensure space and enter always terminate links
    if (!['Space', 'Enter', ' ', 'Return'].includes(event.key)) {
      return next();
    }
    const mark = editor.value.activeMarks.find(m => m.type === LINK_TYPE);
    if (mark) {
      editor.removeMark(mark);
    }
    return next();
  },
  renderMark,
  rules,
  commands: {
    'contenteditable:insert-link': (event, editor) => {
      // want to see a hack? here you go!
      // 1: find our container and then find the link toolbar icon - this approach
      // ensures we get the link button in the /current/ composer.
      const linkButton = event.target
        .closest('.RichEditor-root')
        .querySelector('.fa.fa-link')
        .closest('button');

      // 2: click it.
      if (linkButton) {
        linkButton.dispatchEvent(
          new MouseEvent('mousedown', {
            view: window,
            bubbles: true,
            cancelable: true,
          })
        );
      }
      return editor;
    },
  },
};

const plugins: ComposerEditorPlugin[] = [
  BaseLinkPlugin,
  AutoReplace({
    trigger: e => !!TriggerKeyValues[e.key],
    before: RegExpUtils.emailRegex({ requireStartOrWhitespace: true, matchTailOfString: true }),
    change: buildAutoReplaceHandler({ hrefPrefix: 'mailto:' }),
  }),
  AutoReplace({
    trigger: e => !!TriggerKeyValues[e.key],
    before: RegExpUtils.urlRegex({ matchTailOfString: true }),
    change: buildAutoReplaceHandler(),
  }),
];

export default plugins;
