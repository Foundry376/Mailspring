import React from 'react';
import { Editor, Decoration, Text } from 'slate';
import { ComposerEditorPlugin, ComposerEditorPluginTopLevelComponentProps } from './types';
import { GrammarCheckStore } from '../../../internal_packages/composer-grammar-check/lib/grammar-check-store';

export const GRAMMAR_ERROR_MARK = 'grammar-error';

// --- IME composition tracking ---
const composingWeakmap = new WeakMap<Editor, number>();

// --- Dirty paragraph tracking state ---
const previousDocumentByDraft = new Map<string, any>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimerStart = 0;

// --- Category to underline color mapping ---
function underlineColorForCategory(category: string): string {
  switch (category) {
    case 'TYPOS':
      return '#e74c3c';
    case 'STYLE':
    case 'REDUNDANCY':
      return '#f39c12';
    case 'GRAMMAR':
    case 'PUNCTUATION':
    case 'CASING':
    default:
      return '#3498db';
  }
}

// --- Offset-to-Slate mapping ---
function offsetToSlateRange(
  texts: Text[],
  offset: number,
  length: number
): { startKey: string; startOffset: number; endKey: string; endOffset: number } | null {
  let charsSoFar = 0;
  let startKey: string | undefined;
  let startOffset: number | undefined;

  for (const text of texts) {
    const textLength = text.text.length;

    if (startKey === undefined && charsSoFar + textLength > offset) {
      startKey = text.key;
      startOffset = offset - charsSoFar;
    }
    if (startKey !== undefined && charsSoFar + textLength >= offset + length) {
      return {
        startKey,
        startOffset: startOffset!,
        endKey: text.key,
        endOffset: offset + length - charsSoFar,
      };
    }
    charsSoFar += textLength;
  }
  return null;
}

// --- Apply grammar decorations from store to editor ---
function applyGrammarDecorations(editor: Editor, draftId: string) {
  const { value } = editor;
  const allErrors = GrammarCheckStore.allErrorsForDraft(draftId);
  const decorations: Decoration[] = [];

  value.document.nodes.forEach((block) => {
    if (block.object !== 'block') return;

    const blockErrors = allErrors.get(block.key);
    if (!blockErrors || !blockErrors.errors.length) return;

    // Staleness check: verify the text hasn't changed since we checked
    if (block.text !== blockErrors.text) return;

    const texts = block.getTexts().toArray();

    for (const error of blockErrors.errors) {
      const range = offsetToSlateRange(texts, error.offset, error.length);
      if (!range) continue;

      decorations.push(
        Decoration.create({
          anchor: { key: range.startKey, offset: range.startOffset },
          focus: { key: range.endKey, offset: range.endOffset },
          mark: {
            type: GRAMMAR_ERROR_MARK,
            data: {
              message: error.message,
              shortMessage: error.shortMessage,
              replacements: error.replacements,
              ruleId: error.ruleId,
              category: error.category,
            },
          },
        })
      );
    }
  });

  // Compare with existing decorations to avoid unnecessary re-renders
  const previous = value.get('decorations') as any;
  if (previous && previous.size === decorations.length) {
    const table: { [key: string]: boolean } = {};
    previous.forEach((d: any) => {
      table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`] = true;
    });
    let changed = false;
    for (const d of decorations) {
      if (!table[`${d.anchor.key}:${d.anchor.offset}-${d.focus.key}:${d.focus.offset}`]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
  }

  // Apply decorations without affecting undo/redo
  editor.withoutSaving(() => {
    (editor as any).setDecorations(decorations);
  });
}

// --- Apply replacement ---
function applyReplacement(editor: Editor, replacement: string) {
  const { value } = editor;
  const { document, selection } = value;
  if (!selection.anchor) return;

  const anchorKey = selection.anchor.key;
  const node = document.getNode(anchorKey);
  if (!node || node.object !== 'text') return;

  // Find the extent of the grammar-error decoration at the cursor
  // We need to look at the decorations on the value to find the range
  const decorations = value.get('decorations') as any;
  if (!decorations) return;

  let targetDecoration: any = null;
  decorations.forEach((d: any) => {
    if (d.mark.type !== GRAMMAR_ERROR_MARK) return;
    // Check if cursor is within this decoration
    const anchorOffset = selection.anchor.offset;
    if (
      d.anchor.key === anchorKey &&
      d.focus.key === anchorKey &&
      anchorOffset >= d.anchor.offset &&
      anchorOffset <= d.focus.offset
    ) {
      targetDecoration = d;
    }
  });

  if (targetDecoration) {
    editor
      .select({
        anchor: { key: targetDecoration.anchor.key, offset: targetDecoration.anchor.offset },
        focus: { key: targetDecoration.focus.key, offset: targetDecoration.focus.offset },
        isFocused: true,
      } as any)
      .insertText(replacement)
      .focus();
  }
}

// --- renderMark ---
function renderMark(
  {
    mark,
    children,
    targetIsHTML,
  }: {
    mark: any;
    children: any;
    targetIsHTML?: boolean;
  },
  editor: Editor = null,
  next = () => {}
) {
  if (mark.type !== GRAMMAR_ERROR_MARK) return next();

  // Never render grammar marks in HTML output (sent email)
  if (targetIsHTML) return children;

  const category = mark.data.get ? mark.data.get('category') : mark.data.category;
  const color = underlineColorForCategory(category || '');

  return (
    <span
      className="grammar-error"
      data-grammar-error={true}
      style={{
        backgroundImage:
          `linear-gradient(45deg, transparent 65%, ${color} 80%, transparent 90%), ` +
          `linear-gradient(135deg, transparent 5%, ${color} 15%, transparent 25%), ` +
          `linear-gradient(135deg, transparent 45%, ${color} 55%, transparent 65%), ` +
          `linear-gradient(45deg, transparent 25%, ${color} 35%, transparent 50%)`,
        backgroundSize: '8px 2px',
        backgroundPosition: 'bottom left',
        backgroundRepeat: 'repeat-x',
        paddingBottom: '2px',
      }}
    >
      {children}
    </span>
  );
}

// --- Floating Correction Popover ---
function FloatingCorrectionPopover({ editor, value }: ComposerEditorPluginTopLevelComponentProps) {
  if (!value.selection || !value.selection.isFocused || !value.selection.isCollapsed) {
    return null;
  }

  const grammarMark = value.activeMarks.find((m) => m.type === GRAMMAR_ERROR_MARK);
  if (!grammarMark) return null;

  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  const startEl = range.startContainer.parentElement;
  if (!startEl) return null;

  const target = startEl.closest('[data-grammar-error]');
  if (!target) return null;

  const parent = target.closest('.RichEditor-content') as HTMLElement;
  if (!parent) return null;

  const parentRect = parent.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const message = grammarMark.data.get('message') as string;
  const shortMessage = grammarMark.data.get('shortMessage') as string;
  const replacements = (grammarMark.data.get('replacements') as string[]) || [];
  const ruleId = grammarMark.data.get('ruleId') as string;

  return (
    <div
      className="grammar-correction-popover"
      style={{
        position: 'absolute',
        left: targetRect.left - parentRect.left,
        top: targetRect.bottom - parentRect.top + 4,
        zIndex: 10,
      }}
    >
      <div className="grammar-message">
        <strong>{shortMessage || 'Grammar'}</strong>
        <p>{message}</p>
      </div>
      {replacements.length > 0 && (
        <div className="grammar-replacements">
          {replacements.slice(0, 5).map((replacement, i) => (
            <button
              key={i}
              className="btn btn-small"
              onMouseDown={(e) => {
                e.preventDefault();
                applyReplacement(editor, replacement);
              }}
            >
              {replacement}
            </button>
          ))}
        </div>
      )}
      <div className="grammar-actions">
        <button
          className="btn btn-small btn-dismiss"
          onMouseDown={(e) => {
            e.preventDefault();
            GrammarCheckStore.dismissRule(ruleId);
          }}
        >
          Dismiss rule
        </button>
      </div>
    </div>
  );
}

// --- onChange handler ---
function onChange(editor: Editor, next: () => void) {
  if (!AppEnv.config.get('core.composing.grammarCheck')) {
    return next();
  }

  // Don't check during IME composition
  if (composingWeakmap.get(editor)) {
    return next();
  }

  // Throttle: don't diff on every keystroke if changes are very rapid
  const now = Date.now();
  if (debounceTimer && now - debounceTimerStart < 200) {
    return next();
  }

  const draft = (editor.props as any).propsForPlugins
    ? (editor.props as any).propsForPlugins.draft
    : null;
  if (!draft) return next();

  const draftId = draft.headerMessageId;
  const currDoc = editor.value.document;
  const prevDoc = previousDocumentByDraft.get(draftId);

  if (prevDoc) {
    // Diff blocks to find which paragraphs changed
    currDoc.nodes.forEach((block) => {
      if (block.object !== 'block') return;
      const prevBlock = prevDoc.getNode(block.key);
      if (!prevBlock || prevBlock.text !== block.text) {
        GrammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });

    // Clear errors for deleted blocks
    prevDoc.nodes.forEach((block) => {
      if (block.object !== 'block') return;
      if (!currDoc.getNode(block.key)) {
        GrammarCheckStore.clearBlock(draftId, block.key);
      }
    });
  } else {
    // First onChange for this draft - mark all blocks dirty for initial check
    currDoc.nodes.forEach((block) => {
      if (block.object === 'block') {
        GrammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });
  }

  previousDocumentByDraft.set(draftId, currDoc);

  // Debounce the actual API check
  debounceTimerStart = now;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    GrammarCheckStore.checkDirtyBlocks(draftId).then(() => {
      // Apply new decorations once results arrive
      try {
        applyGrammarDecorations(editor, draftId);
      } catch (err) {
        console.warn('Grammar check: failed to apply decorations', err);
      }
    });
  }, 800);

  return next();
}

// --- Export Slate plugin array ---
const plugins: ComposerEditorPlugin[] = [
  {
    onChange,
    renderMark,
    topLevelComponent: FloatingCorrectionPopover,
    rules: [], // No HTML serialization rules - decorations are never serialized

    // IME composition handling
    onCompositionStart: (event, editor, next) => {
      composingWeakmap.set(editor, (composingWeakmap.get(editor) || 0) + 1);
      next();
    },
    onCompositionEnd: (event, editor, next) => {
      composingWeakmap.set(editor, Math.max(0, (composingWeakmap.get(editor) || 0) - 1));
      next();
    },
  },
];

export default plugins;
