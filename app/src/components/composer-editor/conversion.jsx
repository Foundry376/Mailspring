import Html from 'slate-html-serializer';
import { Value } from 'slate';

import BaseMarkPlugins from './base-mark-plugins';
import TemplatePlugins from './template-plugins';
import UneditablePlugins, { UNEDITABLE_TAGS } from './uneditable-plugins';
import BaseBlockPlugins, { BLOCK_TAGS } from './base-block-plugins';
import InlineAttachmentPlugins from './inline-attachment-plugins';
import MarkdownPlugins from './markdown-plugins';
import LinkPlugins from './link-plugins';

export const plugins = [
  ...InlineAttachmentPlugins,
  ...UneditablePlugins,
  ...TemplatePlugins,
  ...BaseMarkPlugins,
  ...BaseBlockPlugins,
  ...LinkPlugins,
  ...MarkdownPlugins,
];

const HtmlSerializer = new Html({
  rules: [].concat(...plugins.filter(p => p.rules).map(p => p.rules)),
});

const DefaultParse = HtmlSerializer.parseHtml;
HtmlSerializer.parseHtml = html => {
  const tree = DefaultParse.apply(HtmlSerializer, [html]);
  const collapse = require('collapse-whitespace');
  collapse(tree);

  // get rid of <meta> and <style> tags since HTML is inlined
  Array.from(tree.querySelectorAll('meta')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('style')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('title')).forEach(m => m.remove());

  // ensure that no DIVs contain both element children and text node children. This is
  // not allowed by Slate's core schema: blocks must contain inlines and text OR blocks.
  // https://docs.slatejs.org/guides/data-model#documents-and-nodes
  const treeWalker = document.createTreeWalker(tree, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => {
      // If this node is uneditable, (most likely a table in quoted text),
      // we can safely skip this entire subtree
      if (UNEDITABLE_TAGS.includes(node.nodeName.toLowerCase())) {
        return NodeFilter.FILTER_REJECT;
      }
      return BLOCK_TAGS.includes(node.nodeName.toLowerCase())
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  const invalidContainers = [];
  const inlinesToRemove = [];
  const isSlateBlockNode = n =>
    BLOCK_TAGS.includes(n.nodeName.toLowerCase()) ||
    UNEDITABLE_TAGS.includes(n.nodeName.toLowerCase());

  while (treeWalker.nextNode()) {
    const children = Array.from(treeWalker.currentNode.childNodes);
    const inlineChildren = children.filter(n => !isSlateBlockNode(n));

    const pointlessInlineChildren = inlineChildren.filter(
      tn => tn.textContent === '' || tn.textContent === ' '
    );

    // we found text/inline children, but not ALL of them
    const hasInlineChildren = inlineChildren.length - pointlessInlineChildren.length > 0;
    if (hasInlineChildren && inlineChildren.length < children.length) {
      inlinesToRemove.push(...pointlessInlineChildren);
      invalidContainers.push(treeWalker.currentNode);
    }
  }

  // remove all the pointless inline nodes
  inlinesToRemove.forEach(tn => tn.remove());

  // iterate through containers that have mixed children and wrap all text/inline
  // children into new <div> block nodes, so the children are all blocks. Put
  // sequential text+inline+text together into the same new <div> to avoid inserting
  // newlines as much as possible.
  invalidContainers.forEach(tn => {
    const childNodes = Array.from(tn.childNodes);
    let newBlockNode = null;

    for (const child of childNodes) {
      if (isSlateBlockNode(child)) {
        newBlockNode = null;
        continue;
      }
      if (!newBlockNode) {
        newBlockNode = document.createElement('div');
        tn.insertBefore(newBlockNode, child);
        // Now that we've wrapped the text node into a block, it forces a newline.
        // If it's preceded by a <br>, that <br> is no longer necessary.
        if (newBlockNode.previousSibling && newBlockNode.previousSibling.nodeName === 'BR') {
          newBlockNode.previousSibling.remove();
        }
      }
      newBlockNode.appendChild(child);
    }
  });

  // We coerce <p> tags to <div> tags and don't apply any padding. Any incoming <p>
  // tags should be followed by <br> tags to maintain the intended spacing.
  const pWalker = document.createTreeWalker(tree, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => {
      return node.nodeName === 'P' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  while (pWalker.nextNode()) {
    const p = pWalker.currentNode;

    // if the <p> is followed by an empty <p> and then another <p>, remove the empty
    // because <p>'s margins almost always collapse during display.
    if (
      p.nextSibling &&
      p.nextSibling.nodeName === 'P' &&
      p.nextSibling.textContent.trim().length === 0 &&
      p.nextSibling.nextSibling &&
      p.nextSibling.nextSibling.nodeName === 'P' &&
      p.nextSibling.nextSibling.textContent.trim().length > 0
    ) {
      p.nextSibling.remove();
    }

    // if the <p> is followed by a non-empty node, insert a <br>
    if (p.nextSibling && p.textContent.trim().length) {
      const br = document.createElement('BR');
      p.parentNode.insertBefore(br, p.nextSibling);
    }
  }

  return tree;
};

export function convertFromHTML(html) {
  return HtmlSerializer.deserialize(html);
}

export function convertToHTML(value) {
  return HtmlSerializer.serialize(value);
}
