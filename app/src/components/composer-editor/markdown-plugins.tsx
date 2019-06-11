import AutoReplace from 'slate-auto-replace';
import { Editor } from 'slate';
import { BLOCK_CONFIG } from './base-block-plugins';
import { MARK_CONFIG } from './base-mark-plugins';
import { ComposerEditorPlugin } from './types';

const plugins: ComposerEditorPlugin[] = [
  // **abd* + *
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /([*]{2})([^*]+)([*]{1})$/,
    change: (editor: Editor, e, matches) => {
      editor
        .addMark(MARK_CONFIG.bold.type)
        .insertText(matches.before[2])
        .toggleMark(MARK_CONFIG.bold.type)
        .insertText(' ');
    },
  }),

  // *abd + * [and not another trailing *]
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /(?:[^|^*]){1}([*]{1})([^*]+)$/,
    change: (editor: Editor, e, matches) => {
      editor
        .addMark(MARK_CONFIG.italic.type)
        .insertText(matches.before[2])
        .toggleMark(MARK_CONFIG.italic.type)
        .insertText(' ');
    },
  }),

  // * + * + abd**
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    before: /(\*)$/,
    after: /^([^*]+)([*]{2})/,
    change: (editor: Editor, e, matches) => {
      const text = matches.after[1];
      editor
        .addMark(MARK_CONFIG.bold.type)
        .insertText(text)
        .moveAnchorForward(-text.length)
        .moveToAnchor();
    },
  }),

  // * + abd* [and not another trailing *]
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '*',
    after: /^([^*]+)([*]{1})(?:[^*]{1}|$)/,
    change: (editor: Editor, e, matches) => {
      const text = matches.after[1];
      editor
        .addMark(MARK_CONFIG.italic.type)
        .insertText(text)
        .moveAnchorForward(-text.length)
        .moveToAnchor();
    },
  }),

  // Code Block Creation (```)
  AutoReplace({
    onlyIn: [BLOCK_CONFIG.div.type],
    trigger: '`',
    before: /^([`]{2})$/,
    change: (editor: Editor, e, matches) => {
      editor.setBlocks(BLOCK_CONFIG.code.type);
    },
  }),

  // Code Inline Creation (`a`)
  AutoReplace({
    ignoreIn: BLOCK_CONFIG.code.type,
    trigger: '`',
    before: /(?:^|[^`])([`]{1})([^`]+)$/,
    change: (editor: Editor, e, matches) => {
      editor
        .addMark(MARK_CONFIG.codeInline.type)
        .insertText(matches.before[2])
        .removeMark(MARK_CONFIG.codeInline.type)
        .insertText(' ');
    },
  }),
];

export default plugins;
