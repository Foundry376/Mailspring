import React from 'react';

import { Mark } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { RegExpUtils } from 'mailspring-exports';

import { BuildMarkButtonWithValuePicker } from './toolbar-component-factories';

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

function renderMark({ mark, children }) {
    if (mark.type === LINK_TYPE) {
        const href = mark.data.href || mark.data.get('href');
        return (
            <a href={href} title={href}>
                {children}
            </a>
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
                iconClassOn: 'fa fa-unlink',
                iconClassOff: 'fa fa-link',
                placeholder: 'http://',
            }),
        ],
        onPaste,
        renderMark,
        rules,
        commands: {
            'contenteditable:insert-link': event => {
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
            },
        },
    },
    AutoReplace({
        trigger: e => !!TriggerKeyValues[e.key],
        before: RegExpUtils.urlRegex({ matchTailOfString: true }),
        transform: (transform, e, matches) => {
            if (transform.value.activeMarks.find(m => m.type === LINK_TYPE))
                return transform.insertText(TriggerKeyValues[e.key]);

            const link = matches.before[0];
            const mark = Mark.create({ type: LINK_TYPE, data: { href: matches.before[0] } });
            return transform
                .deleteBackward(link.length)
                .addMark(mark)
                .insertText(link)
                .removeMark(mark)
                .insertText(TriggerKeyValues[e.key]);
        },
    }),
];