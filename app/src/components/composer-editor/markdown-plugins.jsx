import { Mark } from 'slate';
import AutoReplace from 'slate-auto-replace';

const CODE_BLOCK = 'code';
const ITALIC_MARK = 'italic';
const BOLD_MARK = 'bold';

export default [
  // **abd* + *
  AutoReplace({
    ignoreIn: CODE_BLOCK,
    trigger: '*',
    before: /([*]{2})([^*]+)([*]{1})$/,
    transform: (transform, e, matches) => {
      const text = matches.before[2];
      const mark = Mark.create({ type: BOLD_MARK });
      const marks = Mark.createSet([mark]);
      return transform.insertText(text, marks).removeMark(mark.type);
    },
  }),

  // *abd + * [and not another trailing *]
  AutoReplace({
    ignoreIn: CODE_BLOCK,
    trigger: '*',
    before: /(?:[^|^*]){1}([*]{1})([^*]+)$/,
    transform: (transform, e, matches) => {
      const text = matches.before[2];
      const mark = Mark.create({ type: ITALIC_MARK });
      const marks = Mark.createSet([mark]);
      return transform.insertText(text, marks).removeMark(mark.type);
    },
  }),

  // * + * + abd**
  AutoReplace({
    ignoreIn: CODE_BLOCK,
    trigger: '*',
    before: /(\*)$/,
    after: /^([^*]+)([*]{2})/,
    transform: (transform, e, matches) => {
      const text = matches.after[1];
      const mark = Mark.create({ type: BOLD_MARK });
      const marks = Mark.createSet([mark]);
      return transform
        .insertText(text, marks)
        .moveAnchor(-text.length)
        .collapseToAnchor();
    },
  }),

  // * + abd* [and not another trailing *]
  AutoReplace({
    ignoreIn: CODE_BLOCK,
    trigger: '*',
    after: /^([^*]+)([*]{1})(?:[^*]{1}|$)/,
    transform: (transform, e, matches) => {
      const text = matches.after[1];
      const mark = Mark.create({ type: ITALIC_MARK });
      const marks = Mark.createSet([mark]);
      return transform
        .insertText(text, marks)
        .moveAnchor(-text.length)
        .collapseToAnchor();
    },
  }),
];
