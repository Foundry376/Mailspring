import React from 'react';

import { Mark } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { RegExpUtils } from 'mailspring-exports';

import { BuildMarkButtonWithValuePicker, getMarkOfType } from './toolbar-component-factories';

export const LINK_TYPE = 'link';

function onPaste(event, change, editor) {
  const html = event.clipboardData.getData('text/html');
  const plain = event.clipboardData.getData('text/plain');
  const regex = RegExpUtils.urlRegex({ matchStartOfString: true, matchTailOfString: true });
  if (!html && plain && plain.match(regex)) {
    const mark = Mark.create({ type: LINK_TYPE, data: { href: plain } });
    change
      .addMark(mark)
      .insertText(plain)
      .removeMark(mark);
    return true;
  }
}

function buildAutoReplaceHandler({ hrefPrefix = '' } = {}) {
  return function (transform, e, matches) {
    if (transform.value.activeMarks.find(m => m.type === LINK_TYPE))
      return transform.insertText(TriggerKeyValues[e.key]);

    const link = matches.before[0];
    const mark = Mark.create({ type: LINK_TYPE, data: { href: hrefPrefix + matches.before[0] } });
    return transform
      .deleteBackward(link.length)
      .addMark(mark)
      .insertText(link)
      .removeMark(mark)
      .insertText(TriggerKeyValues[e.key]);
  };
}

function renderMark({ mark, children, targetIsHTML }) {
  if (mark.type !== LINK_TYPE) {
    return;
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

export default [
  {
    toolbarComponents: [
      BuildMarkButtonWithValuePicker({
        type: LINK_TYPE,
        field: 'href',
        iconClassOn: 'dt-icon dt-icon-link',
        iconClassOff: 'dt-icon dt-icon-link',
        placeholder: 'http://',
      }),
    ],
    onPaste,
    onKeyDown: function onKeyDown(event, change) {
      // ensure space and enter always terminate links
      if (!['Space', 'Enter', ' ', 'Return'].includes(event.key)) {
        return;
      }
      const mark = getMarkOfType(change.value, LINK_TYPE);
      if (mark) {
        change.removeMark(mark);
      }
    },
    renderMark,
    rules,
    commands: {
      'contenteditable:insert-link': event => {
        // want to see a hack? here you go!
        // 1: find our container and then find the link toolbar icon - this approach
        // ensures we get the link button in the /current/ composer.
        const linkButton = event.target
          .closest('.RichEditor-root')
          .querySelector('.dt-icon.dt-icon-link')
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
      },
    },
  },
  AutoReplace({
    trigger: e => !!TriggerKeyValues[e.key],
    before: RegExpUtils.emailRegex({ requireStartOrWhitespace: true, matchTailOfString: true }),
    transform: buildAutoReplaceHandler({ hrefPrefix: 'mailto:' }),
  }),
  AutoReplace({
    trigger: e => !!TriggerKeyValues[e.key],
    before: RegExpUtils.urlRegex({ matchTailOfString: true }),
    transform: buildAutoReplaceHandler(),
  }),
];
