import React from 'react';
import { EditorState, SelectionState, Modifier } from 'draft-js';
import { genKey, ContentBlock, RichUtils } from 'draft-js';

const UNEDITABLE_HTML = 'UNEDITABLE_HTML';
const ATTRIBUTION_LINE = 'ATTRIBUTION_LINE';

// Convenience functfions

export function selectEndOfReply(editorState) {
  const contentState = editorState.getCurrentContent();
  const blocks = [].concat(contentState.blockMap.toArray());
  let key = null;
  let pos = null;

  if (blocks[0].getLength() === 0 || blocks[0].text.startsWith('\n')) {
    key = blocks[0].key;
    pos = 0;
  } else {
    const lastBlockNotBlockquote = blocks
      .reverse()
      .find(b => b.type !== 'blockquote' && b.text.length && !b.text.endsWith('wrote:'));
    key = lastBlockNotBlockquote.key;
    pos = lastBlockNotBlockquote.text.length;
  }

  if (!key) {
    return editorState;
  }
  return EditorState.acceptSelection(
    editorState,
    new SelectionState({
      anchorKey: key,
      anchorOffset: pos,
      focusKey: key,
      focusOffset: pos,
      isBackward: false,
    })
  );
}

export function hasBlockquote(editorState) {
  const blocks = editorState.getCurrentContent().blockMap.toArray();
  return !!blocks.find(b => b.type === 'blockquote');
}

export function hasNonTrailingBlockquote(editorState) {
  const blocks = editorState.getCurrentContent().blockMap.toArray();
  let foundQuote = false;
  for (const b of blocks) {
    if (b.type === 'blockquote') {
      foundQuote = true;
    } else if (foundQuote) {
      // the quote is followed by something other than another quote,
      // which means it's inline
      return true;
    }
  }
  return false;
}

export function hideQuotedTextByDefault(draft) {
  if (draft.isForwarded()) {
    return false;
  }
  if (hasNonTrailingBlockquote(draft.bodyEditorState)) {
    return false;
  }
  return true;
}

//

export function withinQuotedText(node) {
  return withinQuotedTextOfDepth(node, 1);
}

export function withinQuotedTextOfDepth(node, depth) {
  let n = node;
  let d = 0;

  while (n) {
    if (n.nodeName === 'BLOCKQUOTE') {
      d += 1;
      if (d >= depth) {
        return true;
      }
    }
    n = n.parentNode;
  }
  return false;
}

export const HTMLConfig = {
  htmlToEntity(nodeName, node, createEntity) {
    const isDeepBlockquote =
      node.nodeName === 'BLOCKQUOTE' &&
      node.innerText.trim().length &&
      withinQuotedTextOfDepth(node, 2);

    if (isDeepBlockquote) {
      const outerHTML = `<blockquote class="gmail_quote">${node.innerHTML}</blockquote>`;
      node.innerHTML = ' ';
      return createEntity(UNEDITABLE_HTML, 'IMMUTABLE', { outerHTML });
    }

    const isUneditable = node.nodeName === 'TABLE';

    if (isUneditable) {
      const outerHTML = node.outerHTML;
      node.innerHTML = ' ';
      return createEntity(UNEDITABLE_HTML, 'IMMUTABLE', { outerHTML });
    }

    const isAttributionLine = node.classList && node.classList.contains('gmail_quote_attribution');
    if (isAttributionLine) {
      return createEntity(ATTRIBUTION_LINE, 'IMMUTABLE', {});
    }
  },

  entityToHTML(entity, originalText) {
    if (entity.type === UNEDITABLE_HTML) {
      return {
        empty: entity.data.outerHTML,
        start: entity.data.outerHTML,
        end: '',
      };
    }
    if (entity.type === ATTRIBUTION_LINE) {
      return {
        start: `<span class="gmail_quote_attribution">`,
        end: `</span>`,
      };
    }
  },
};

function findEntities(contentBlock, callback, contentState) {
  contentBlock.findEntityRanges(character => {
    const entityKey = character.getEntity();
    if (!entityKey) return;
    const type = contentState.getEntity(entityKey).getType();
    return [UNEDITABLE_HTML, ATTRIBUTION_LINE].includes(type);
  }, callback);
}

class QuotedTextEntity extends React.Component {
  shouldComponentUpdate() {
    return false;
  }

  render() {
    const entity = this.props.contentState.getEntity(this.props.entityKey);
    const { outerHTML } = entity.getData();

    if (entity.getType() === UNEDITABLE_HTML) {
      return <div className="uneditable" dangerouslySetInnerHTML={{ __html: outerHTML }} />;
    }
    if (entity.getType() === ATTRIBUTION_LINE) {
      return <div className="gmail_quote_attribution">{this.props.children}</div>;
    }
    return <span />;
  }
}

function handleReturnAndBreakOutOfQuote(e, editorState, { setEditorState }) {
  const currentBlockType = RichUtils.getCurrentBlockType(editorState);
  if (currentBlockType !== 'blockquote') {
    return 'not-handled';
  }

  const selection = editorState.getSelection();
  if (!selection.isCollapsed()) {
    return 'not-handled';
  }

  let nextEditorState = editorState;
  let nextContentState = Modifier.splitBlock(editorState.getCurrentContent(), selection);

  const currentBlockKey = selection.getEndKey();
  const currentBlock = nextContentState.getBlockForKey(currentBlockKey);

  const emptyBlockKey = genKey();
  const emptyBlock = new ContentBlock({
    key: emptyBlockKey,
    text: '',
    type: 'unstyled',
    depth: 0,
  });

  const blockMap = nextContentState.getBlockMap();
  const blocksBefore = blockMap.toSeq().takeUntil(v => v === currentBlock);
  const blocksAfter = blockMap
    .toSeq()
    .skipUntil(v => v === currentBlock)
    .rest();

  // Join back together with the old + current + new block + after

  nextContentState = nextContentState.merge({
    blockMap: blocksBefore
      .concat([[currentBlockKey, currentBlock], [emptyBlockKey, emptyBlock]], blocksAfter)
      .toOrderedMap(),
    selectionBefore: selection,
    selectionAfter: selection.merge({
      anchorKey: emptyBlockKey,
      anchorOffset: 0,
      focusKey: emptyBlockKey,
      focusOffset: 0,
      isBackward: false,
    }),
  });

  nextEditorState = EditorState.push(nextEditorState, nextContentState, 'insert-fragment');

  // Remove extra return of present
  const blockBelowInsertion = blocksAfter.first();
  if (blockBelowInsertion && blockBelowInsertion.text.startsWith('\n')) {
    const sel = nextEditorState.getSelection();
    nextContentState = Modifier.removeRange(
      nextContentState,
      new SelectionState({
        anchorKey: blockBelowInsertion.key,
        anchorOffset: 0,
        focusKey: blockBelowInsertion.key,
        focusOffset: 1,
        isBackward: false,
      }),
      'forward'
    );
    nextEditorState = EditorState.push(nextEditorState, nextContentState, 'remove-range');
    nextEditorState = EditorState.acceptSelection(nextEditorState, sel);
  }

  // Set the state
  setEditorState(nextEditorState);
  return 'handled';
}

const createQuotedTextPlugin = () => {
  return {
    handleReturn: handleReturnAndBreakOutOfQuote,
    decorators: [
      {
        strategy: findEntities,
        component: QuotedTextEntity,
      },
    ],
  };
};

export default createQuotedTextPlugin;
