import { Mark } from 'slate';
import AutoReplace from 'slate-auto-replace';
import { BLOCK_CONFIG } from './base-block-plugins';
import { MARK_CONFIG } from './base-mark-plugins';

export default [
  // **abd* + *
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /([*]{2})([^*]+)([*]{1})$/,
    transform: (transform, e, matches) => {
      const text = matches.before[2];
      const mark = Mark.create({ type: MARK_CONFIG.bold.type });
      const marks = Mark.createSet([mark]);
      transform.insertText(text, marks).removeMark(mark.type);
    },
  }),

  // *abd + * [and not another trailing *]
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /(?:[^|^*]){1}([*]{1})([^*]+)$/,
    transform: (transform, e, matches) => {
      const text = matches.before[2];
      const mark = Mark.create({ type: MARK_CONFIG.italic.type });
      const marks = Mark.createSet([mark]);
      transform.insertText(text, marks).removeMark(mark.type);
    },
  }),

  // * + * + abd**
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /(\*)$/,
    after: /^([^*]+)([*]{2})/,
    transform: (transform, e, matches) => {
      const text = matches.after[1];
      const mark = Mark.create({ type: MARK_CONFIG.bold.type });
      const marks = Mark.createSet([mark]);
      transform
        .insertText(text, marks)
        .moveAnchor(-text.length)
        .collapseToAnchor();
    },
  }),

  // * + abd* [and not another trailing *]
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    after: /^([^*]+)([*]{1})(?:[^*]{1}|$)/,
    transform: (transform, e, matches) => {
      const text = matches.after[1];
      const mark = Mark.create({ type: MARK_CONFIG.italic.type });
      const marks = Mark.createSet([mark]);
      transform
        .insertText(text, marks)
        .moveAnchor(-text.length)
        .collapseToAnchor();
    },
  }),

  // Code Block Creation (```)
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type],
    trigger: '`',
    before: /^([`]{2})$/,
    transform: (transform, e, matches) => {
      transform.setBlock(BLOCK_CONFIG.code.type);
    },
  }),

  // Code Inline Creation (`a`)
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '`',
    before: /(?:[^|^`]){1}([`]{1})([^`]+)$/,
    transform: (transform, e, matches) => {
      const text = matches.before[2];
      const mark = Mark.create({ type: MARK_CONFIG.codeInline.type });
      const marks = Mark.createSet([mark]);
      transform.insertText(text, marks).removeMark(mark);
    },
  }),
];
