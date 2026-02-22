import React from 'react';
import { Editor, Decoration, Mark, Point, Text } from 'slate';
import { localized } from 'mailspring-exports';
import { ComposerEditorPlugin, ComposerEditorPluginTopLevelComponentProps } from './types';

export const GRAMMAR_ERROR_MARK = 'grammar-error';

// Minimal shape of a grammar error as returned by the check API.
// Mirrors the fields accessed in this file without importing from the plugin package.
interface GrammarErrorInfo {
  offset: number;
  length: number;
  message: string;
  shortMessage: string;
  replacements: string[];
  ruleId: string;
  category: string;
}

interface BlockCheckResult {
  text: string;
  errors: GrammarErrorInfo[];
}

// The subset of GrammarCheckStore's public API consumed by this Slate plugin.
export interface GrammarCheckStoreAPI {
  isEnabled(): boolean;
  allErrorsForDraft(draftId: string): Map<string, BlockCheckResult>;
  markDirty(draftId: string, blockKey: string, blockText: string): void;
  clearBlock(draftId: string, blockKey: string): void;
  checkDirtyBlocks(draftId: string): Promise<boolean>;
  dismissRule(ruleId: string): void;
}

// --- Store injection (set by the plugin's activate(), avoids cross-boundary static import) ---
let grammarCheckStore: GrammarCheckStoreAPI | null = null;

export function setGrammarCheckStore(store: GrammarCheckStoreAPI) {
  grammarCheckStore = store;
}

export function clearGrammarCheckStore() {
  grammarCheckStore = null;
}

// --- Draft cleanup (called by main.ts on send/destroy) ---
export function cleanupDraft(draftId: string) {
  previousDocumentByDraft.delete(draftId);
  latestEditorByDraft.delete(draftId);
  const entry = debounceTimers.get(draftId);
  if (entry) {
    clearTimeout(entry.timer);
    debounceTimers.delete(draftId);
  }
}

// --- Clear grammar decorations from all tracked editors ---
// Called when grammar check is toggled off so underlines disappear immediately.
export function clearAllGrammarDecorations() {
  latestEditorByDraft.forEach(editor => {
    try {
      const decorations = editor.value.get('decorations') as any;
      if (!decorations || !decorations.size) return;
      const remaining = decorations.filter((d: any) => d.mark.type !== GRAMMAR_ERROR_MARK);
      if (remaining.size !== decorations.size) {
        editor.withoutSaving(() => {
          (editor as any).setDecorations(remaining.toArray());
        });
      }
    } catch (err) {
      // Editor may no longer be mounted — ignore
    }
  });
}

// --- Schedule a deferred grammar check for a draft ---
// Cancels any pending timer for the draft, then fires checkDirtyBlocks + applyGrammarDecorations
// after delayMs. `start` defaults to now and is stored so onChange can throttle rapid keystrokes.
function _scheduleCheck(draftId: string, editor: Editor, delayMs: number, start = Date.now()) {
  const existing = debounceTimers.get(draftId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    debounceTimers.delete(draftId);
    if (!grammarCheckStore) return;
    grammarCheckStore.checkDirtyBlocks(draftId).then(completed => {
      if (!completed) return; // superseded by a newer check — it will apply its own decorations
      try {
        applyGrammarDecorations(editor, draftId);
      } catch (err) {
        console.warn('Grammar check: failed to apply decorations', err);
      }
    });
  }, delayMs);
  debounceTimers.set(draftId, { timer, start });
}

// --- Trigger an immediate check on a draft's current content ---
// Called when grammar check is toggled ON so existing text is checked right away
// without waiting for the next keystroke.
export function requestInitialCheckForDraft(draftId: string) {
  if (!grammarCheckStore) return;
  const editor = latestEditorByDraft.get(draftId);
  if (!editor) return;

  editor.value.document.nodes.forEach(block => {
    if (block.object === 'block') {
      grammarCheckStore.markDirty(draftId, block.key, block.text);
    }
  });

  _scheduleCheck(draftId, editor, 300);
}

// --- IME composition tracking ---
const composingWeakmap = new WeakMap<object, number>();

// --- Per-draft dirty paragraph tracking state ---
const previousDocumentByDraft = new Map<string, any>();
const debounceTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; start: number }>();
const latestEditorByDraft = new Map<string, Editor>();

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
      point.key === anchor.key && point.offset >= anchor.offset && point.offset <= focus.offset
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

  value.document.nodes.forEach(block => {
    if (block.object !== 'block') return;

    const blockErrors = allErrors.get(block.key);
    if (!blockErrors || !blockErrors.errors.length) return;

    // Staleness check: verify the text hasn't changed since we checked
    if (block.text !== blockErrors.text) {
      console.warn(
        `[grammar] staleness check failed for block ${block.key}:\n` +
          `  current:  ${JSON.stringify(block.text)}\n` +
          `  stored:   ${JSON.stringify(blockErrors.text)}`
      );
      return;
    }

    const texts = block.getTexts().toArray();

    for (const error of blockErrors.errors) {
      const range = offsetToSlateRange(texts, error.offset, error.length);
      if (!range) {
        console.warn(
          `[grammar] offsetToSlateRange returned null for error "${error.ruleId}" ` +
            `offset=${error.offset} length=${error.length} in text: ${JSON.stringify(
              blockErrors.text
            )}\n` +
            `  text nodes: ${JSON.stringify(
              texts.map(t => ({ key: t.key, len: t.text.length, text: t.text }))
            )}`
        );
        continue;
      }

      decorations.push(
        Decoration.create({
          anchor: Point.create({ key: range.startKey, offset: range.startOffset }),
          focus: Point.create({ key: range.endKey, offset: range.endOffset }),
          mark: Mark.create({
            type: GRAMMAR_ERROR_MARK,
            data: {
              message: error.message,
              shortMessage: error.shortMessage,
              replacements: error.replacements,
              ruleId: error.ruleId,
              category: error.category,
            },
          }),
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

// --- Helper: extract mark data from Immutable.js Map or plain object ---
function getMarkData(mark: any) {
  const g = (k: string) => (mark.data.get ? mark.data.get(k) : mark.data[k]);
  const repsRaw = g('replacements');
  return {
    message: g('message') as string,
    shortMessage: g('shortMessage') as string,
    ruleId: g('ruleId') as string,
    // Slate may store the array as an Immutable List; normalise to plain array
    replacements: (repsRaw && repsRaw.toArray ? repsRaw.toArray() : repsRaw || []) as string[],
  };
}

// --- Right-click context menu for a grammar error span ---
function showGrammarContextMenu(mark: any, editor: Editor) {
  const { Menu, MenuItem } = require('@electron/remote');
  const { message, shortMessage, ruleId, replacements } = getMarkData(mark);

  const menu = new Menu();

  menu.append(
    new MenuItem({ label: shortMessage || message || localized('Grammar issue'), enabled: false })
  );

  if (replacements.length > 0) {
    menu.append(new MenuItem({ type: 'separator' }));
    replacements.slice(0, 5).forEach((r: string) => {
      menu.append(
        new MenuItem({
          label: r,
          click: () => applyReplacement(editor, r),
        })
      );
    });
  }

  menu.append(new MenuItem({ type: 'separator' }));
  menu.append(
    new MenuItem({
      label: localized('Ignore rule'),
      enabled: !!(grammarCheckStore && ruleId),
      click: () => grammarCheckStore && grammarCheckStore.dismissRule(ruleId),
    })
  );

  menu.popup({ window: require('@electron/remote').getCurrentWindow() });
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
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        if (editor) showGrammarContextMenu(mark, editor);
      }}
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

// --- Floating Correction Popover (shown when cursor is placed inside an error) ---
function FloatingCorrectionPopover({ editor, value }: ComposerEditorPluginTopLevelComponentProps) {
  if (!grammarCheckStore) return null;
  if (!value.selection || !value.selection.isFocused || !value.selection.isCollapsed) {
    return null;
  }

  // Grammar errors are stored as decorations, NOT as document marks.
  // value.activeMarks only returns marks on text nodes in the document model
  // and will never contain decoration marks — we must check value.decorations.
  const decorations = value.get('decorations') as any;
  if (!decorations || !decorations.size) return null;

  const cursorPoint = { key: value.selection.anchor.key, offset: value.selection.anchor.offset };
  let grammarMark: any = null;
  decorations.forEach((d: any) => {
    if (d.mark.type !== GRAMMAR_ERROR_MARK) return;
    if (isPointInDecoration(value.document, cursorPoint, d)) {
      grammarMark = d.mark;
    }
  });
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

  const { message, shortMessage, replacements, ruleId } = getMarkData(grammarMark);

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
              key={replacement}
              className="btn btn-small"
              onMouseDown={e => {
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
          onMouseDown={e => {
            e.preventDefault();
            grammarCheckStore.dismissRule(ruleId);
          }}
        >
          {localized('Ignore rule')}
        </button>
      </div>
    </div>
  );
}

// --- onChange handler (per-draft debounce) ---
function onChange(editor: Editor, next: () => void) {
  // Always track the latest editor instance per draft so requestInitialCheckForDraft
  // can find it when grammar check is toggled on.
  const draft = (editor as any).props?.propsForPlugins?.draft ?? null;
  if (draft) {
    latestEditorByDraft.set(draft.headerMessageId, editor);
  }

  // Bail when grammar check package is not active or feature is disabled
  if (!grammarCheckStore || !grammarCheckStore.isEnabled()) {
    return next();
  }

  // Don't check during IME composition
  if (composingWeakmap.get(editor)) {
    return next();
  }

  if (!draft) return next();

  const draftId = draft.headerMessageId;

  // Per-draft throttle: don't diff on every keystroke if changes are very rapid
  const now = Date.now();
  const existing = debounceTimers.get(draftId);
  if (existing && now - existing.start < 300) {
    return next();
  }

  const currDoc = editor.value.document;
  const prevDoc = previousDocumentByDraft.get(draftId);

  if (prevDoc) {
    // Diff blocks to find which paragraphs changed
    currDoc.nodes.forEach(block => {
      if (block.object !== 'block') return;
      const prevBlock = prevDoc.getNode(block.key);
      if (!prevBlock || prevBlock.text !== block.text) {
        grammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });

    // Clear errors for deleted blocks
    prevDoc.nodes.forEach(block => {
      if (block.object !== 'block') return;
      if (!currDoc.getNode(block.key)) {
        grammarCheckStore.clearBlock(draftId, block.key);
      }
    });
  } else {
    // First onChange for this draft - mark all blocks dirty for initial check
    currDoc.nodes.forEach(block => {
      if (block.object === 'block') {
        grammarCheckStore.markDirty(draftId, block.key, block.text);
      }
    });
  }

  previousDocumentByDraft.set(draftId, currDoc);

  // Per-draft debounce: cancel only this draft's pending timer.
  // Pass `now` (captured at the top of onChange) as the start time so the next
  // onChange call can throttle itself via the 200ms guard above.
  _scheduleCheck(draftId, editor, 800, now);

  return next();
}

// --- Public API consumed by the composer-grammar-check internal package ---
// Exported here and re-exported via mailspring-exports so the package can import
// without a fragile relative path back into app/src/.
export const GrammarCheckPluginAPI = {
  setGrammarCheckStore,
  clearGrammarCheckStore,
  cleanupDraft,
  clearAllGrammarDecorations,
  requestInitialCheckForDraft,
};

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
