import React from 'react';
import { Editor, Decoration, Text } from 'slate';
import { localized } from 'mailspring-exports';
import { ComposerEditorPlugin, ComposerEditorPluginTopLevelComponentProps } from './types';

export const GRAMMAR_ERROR_MARK = 'grammar-error';

// --- Store injection (set by the plugin's activate(), avoids cross-boundary static import) ---
let grammarCheckStore: any = null;

export function setGrammarCheckStore(store: any) {
  grammarCheckStore = store;
}

export function clearGrammarCheckStore() {
  grammarCheckStore = null;
}

// --- Draft cleanup (called by main.ts on send/destroy) ---
export function cleanupDraft(draftId: string) {
  previousDocumentByDraft.delete(draftId);
  const entry = debounceTimers.get(draftId);
  if (entry) {
    clearTimeout(entry.timer);
    debounceTimers.delete(draftId);
  }
}

// --- IME composition tracking ---
const composingWeakmap = new WeakMap<Editor, number>();

// --- Per-draft dirty paragraph tracking state ---
const previousDocumentByDraft = new Map<string, any>();
const debounceTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; start: number }>();

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

// --- Check if a cursor point falls within a decoration range (handles cross-node spans) ---
function isPointInDecoration(
  doc: any,
  point: { key: string; offset: number },
  decoration: any
): boolean {
  const { anchor, focus } = decoration;

  // Same node for both anchor and focus (common case)
  if (anchor.key === focus.key) {
    return (
      point.key === anchor.key &&
      point.offset >= anchor.offset &&
      point.offset <= focus.offset
    );
  }

  // Cross-node: cursor is in the anchor's text node
  if (point.key === anchor.key) {
    return point.offset >= anchor.offset;
  }
  // Cross-node: cursor is in the focus's text node
  if (point.key === focus.key) {
    return point.offset <= focus.offset;
  }

  // Cursor is in a different text node — check if it sits between anchor and focus
  const block = doc.getClosestBlock(point.key);
  if (!block) return false;

  const texts = block.getTexts().toArray();
  let seenAnchor = false;
  for (const text of texts) {
    if (text.key === anchor.key) seenAnchor = true;
    if (text.key === point.key) return seenAnchor;
    if (text.key === focus.key) return false;
  }
  return false;
}

// --- Apply grammar decorations from store to editor ---
function applyGrammarDecorations(editor: Editor, draftId: string) {
  if (!grammarCheckStore) return;

  const { value } = editor;
  const allErrors = grammarCheckStore.allErrorsForDraft(draftId);
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

// --- Apply replacement (handles cross-node decorations) ---
function applyReplacement(editor: Editor, replacement: string) {
  const { value } = editor;
  const { document, selection } = value;
  if (!selection.anchor) return;

  const anchorKey = selection.anchor.key;

  // Find the grammar-error decoration that contains the cursor
  const decorations = value.get('decorations') as any;
  if (!decorations) return;

  let targetDecoration: any = null;
  const cursorPoint = { key: anchorKey, offset: selection.anchor.offset };
  decorations.forEach((d: any) => {
    if (d.mark.type !== GRAMMAR_ERROR_MARK) return;
    if (isPointInDecoration(document, cursorPoint, d)) {
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
  if (!grammarCheckStore) return null;
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
        <strong>{shortMessage || localized('Grammar')}</strong>
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
            grammarCheckStore.dismissRule(ruleId);
          }}
        >
          {localized('Dismiss rule')}
        </button>
      </div>
    </div>
  );
}

// --- onChange handler (per-draft debounce) ---
function onChange(editor: Editor, next: () => void) {
  // Immediate bail when grammar check package is not active or feature is disabled
  if (!grammarCheckStore || !grammarCheckStore.isEnabled()) {
    return next();
  }

  // Don't check during IME composition
  if (composingWeakmap.get(editor)) {
    return next();
  }

  const draft = (editor.props as any).propsForPlugins
    ? (editor.props as any).propsForPlugins.draft
    : null;
  if (!draft) return next();

  const draftId = draft.headerMessageId;

  // Per-draft throttle: don't diff on every keystroke if changes are very rapid
  const now = Date.now();
  const existing = debounceTimers.get(draftId);
  if (existing && now - existing.start < 200) {
    return next();
  }

  const currDoc = editor.value.document;
  const prevDoc = previousDocumentByDraft.get(draftId);

  if (prevDoc) {
    // Diff blocks to find which paragraphs changed
    currDoc.nodes.forEach((block) => {
      if (block.object !== 'block') return;
      const prevBlock = prevDoc.getNode(block.key);
      if (!prevBlock || prevBlock.text !== block.text) {
        grammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });

    // Clear errors for deleted blocks
    prevDoc.nodes.forEach((block) => {
      if (block.object !== 'block') return;
      if (!currDoc.getNode(block.key)) {
        grammarCheckStore.clearBlock(draftId, block.key);
      }
    });
  } else {
    // First onChange for this draft - mark all blocks dirty for initial check
    currDoc.nodes.forEach((block) => {
      if (block.object === 'block') {
        grammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });
  }

  previousDocumentByDraft.set(draftId, currDoc);

  // Per-draft debounce: cancel only this draft's pending timer
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    debounceTimers.delete(draftId);
    if (!grammarCheckStore) return;
    grammarCheckStore.checkDirtyBlocks(draftId).then(() => {
      try {
        applyGrammarDecorations(editor, draftId);
      } catch (err) {
        console.warn('Grammar check: failed to apply decorations', err);
      }
    });
  }, 800);
  debounceTimers.set(draftId, { timer, start: now });

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
