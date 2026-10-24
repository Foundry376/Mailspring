import React from 'react';

import { Mark, Editor } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { RegExpUtils } from 'mailspring-exports';

import { BuildMarkButtonWithValuePicker, safeActiveMarks } from './toolbar-component-factories';
import { ComposerEditorPlugin } from './types';

export const LINK_TYPE = 'link';

function onPaste(event: React.ClipboardEvent, editor: Editor, next: () => void) {
  const html = event.clipboardData.getData('text/html');
  const plain = event.clipboardData.getData('text/plain');
  const regex = RegExpUtils.urlRegex({ matchStartOfString: true, matchTailOfString: true });
  if (!html && plain && plain.match(regex)) {
    const mark = Mark.create({ type: LINK_TYPE, data: { href: plain } });
    editor.addMark(mark).insertText(plain).removeMark(mark);
  } else {
    return next();
  }
}

// Punctuation that commonly follows a URL in prose, e.g. "(see https://example.com)".
// `;` is left out because it can end a query string.
const TRAILING_PUNCTUATION = `[)\\]}>.,!?:'"]*`;

// Matches a URL right before the cursor, optionally followed by trailing punctuation.
// It keeps the `g` flag: slate-auto-replace uses String.match and deletes every
// captured group it gets back, so the match must come back without groups.
export const URL_BEFORE_CURSOR_REGEX = new RegExp(
  `${RegExpUtils.urlRegex().source}${TRAILING_PUNCTUATION}$`,
  'gi'
);

// Same idea for email addresses, e.g. "(bob@example.com)" or "mail bob@example.com.".
// The address still has to start a word, but may be preceded by an opening bracket
// or quote. None of those characters are valid in the local part.
export const EMAIL_BEFORE_CURSOR_REGEX = new RegExp(
  `(?:^|\\s)[(\\[<"]*${RegExpUtils.emailRegex().source}${TRAILING_PUNCTUATION}$`,
  'g'
);

export function splitTrailingPunctuation(text: string) {
  const match = RegExpUtils.urlRegex({ matchStartOfString: true }).exec(text);
  const link = match ? match[0] : text;
  return { leading: '', link, trailing: text.slice(link.length) };
}

export function splitEmailPunctuation(text: string) {
  const match = RegExpUtils.emailRegex().exec(text);
  if (!match) return { leading: '', link: text, trailing: '' };
  const link = match[0];
  return {
    leading: text.slice(0, match.index),
    link,
    trailing: text.slice(match.index + link.length),
  };
}

const BARE_EMAIL_REGEX = new RegExp(`^${RegExpUtils.emailRegex().source}$`);

type LinkSplitter = (text: string) => { leading: string; link: string; trailing: string };

function buildAutoReplaceHandler(hrefPrefix: string, split: LinkSplitter) {
  return function (editor: Editor, e, matches) {
    if (safeActiveMarks(editor.value).find((m) => m.type === LINK_TYPE))
      return editor.insertText(TriggerKeyValues[e.key]);

    const matched = matches.before[0];
    const { leading, link, trailing } = split(matched);
    // urlRegex also accepts a scheme-less user@host, which needs mailto: to work.
    const href = BARE_EMAIL_REGEX.test(link) ? `mailto:${link}` : hrefPrefix + link;
    const mark = Mark.create({ type: LINK_TYPE, data: { href } });
    return editor
      .deleteBackward(matched.length)
      .insertText(leading)
      .addMark(mark)
      .insertText(link)
      .removeMark(mark)
      .insertText(trailing + TriggerKeyValues[e.key]);
  };
}

function renderMark({ mark, children, targetIsHTML }, editor: Editor = null, next = () => {}) {
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
    return (
      <span
        className="link"
        title={href}
        spellCheck={false}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) {
            AppEnv.windowEventHandler.openLink({ href, metaKey: e.metaKey });
          }
        }}
      >
        {children}
      </span>
    );
  }
}

const rules = [
  {
    deserialize(el: HTMLElement, next: (elements: NodeList) => any) {
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
    serialize(obj: any, children: any) {
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
  onPaste: onPaste as any,
  onKeyDown: function onKeyDown(event: React.KeyboardEvent, editor: Editor, next: () => void) {
    // ensure space and enter always terminate links
    if (!['Space', 'Enter', ' ', 'Return'].includes(event.key)) {
      return next();
    }
    const mark = safeActiveMarks(editor.value).find((m) => m.type === LINK_TYPE);
    if (mark) {
      editor.removeMark(mark);
    }
    return next();
  },
  renderMark: ({ mark, children, targetIsHTML }, editor, next) => {
    return renderMark({ mark, children, targetIsHTML }, editor, next);
  },
  rules,
  appCommands: {
    'contenteditable:insert-link': (event, editor) => {
      // want to see a hack? here you go!
      // 1: find our container and then find the link toolbar icon - this approach
      // ensures we get the link button in the /current/ composer.
      const linkButton = (event.target as HTMLElement)
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
    trigger: (e) => !!TriggerKeyValues[e.key],
    before: EMAIL_BEFORE_CURSOR_REGEX,
    change: buildAutoReplaceHandler('mailto:', splitEmailPunctuation),
  }),
  AutoReplace({
    trigger: (e) => !!TriggerKeyValues[e.key],
    before: URL_BEFORE_CURSOR_REGEX,
    change: buildAutoReplaceHandler('', splitTrailingPunctuation),
  }),
];

export default plugins;
