import React from 'react';
import { RichUtils } from 'draft-js';

export const COLOR_STYLE_PREFIX = 'color-';
export const FONTSIZE_STYLE_PREFIX = 'font-';

const styleMap = {
  CODE: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
    padding: 2,
  },
};

export function editorStateSettingTextStyle(editorState, groupPrefix, groupValue) {
  // TODO: Get all inine styles in selected area, not just at insertion point
  const currentStyle = editorState.getCurrentInlineStyle();
  const currentGroupKeys = currentStyle.filter(value => value.startsWith(groupPrefix));
  const nextGroupKey = groupValue ? `${groupPrefix}${groupValue}` : null;

  let nextEditorState = editorState;

  if (currentGroupKeys.count() !== 1 || currentGroupKeys[0] !== nextGroupKey) {
    for (const key of currentGroupKeys) {
      nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, key);
    }
  }
  if (nextGroupKey) {
    nextEditorState = RichUtils.toggleInlineStyle(nextEditorState, nextGroupKey);
  }
  return nextEditorState;
}

export function styleValueForGroup(editorInlineStyle, group) {
  const match =
    typeof editorInlineStyle === 'string'
      ? editorInlineStyle.startsWith(group) ? editorInlineStyle : null
      : editorInlineStyle.filter(value => value.startsWith(group)).first();

  if (!match) {
    return null;
  }
  return match.split(group).pop();
}

function customStyleFn(style) {
  let styles = {};

  // apply basic styles from the map above
  for (const key of Object.keys(styleMap)) {
    if (typeof style === 'string' ? style === key : style.has(key)) {
      styles = Object.assign(styles, styleMap[key]);
    }
  }

  // apply custom styles where data is encoded in the key
  const color = styleValueForGroup(style, COLOR_STYLE_PREFIX);
  if (color) {
    styles.color = color;
  }
  const fontSize = styleValueForGroup(style, FONTSIZE_STYLE_PREFIX);
  if (fontSize) {
    styles.fontSize = fontSize;
  }
  return styles;
}

export const HTMLConfig = {
  styleToHTML(style) {
    if (style.startsWith(COLOR_STYLE_PREFIX) || style.startsWith(FONTSIZE_STYLE_PREFIX)) {
      return <span data-msn={style} style={customStyleFn(style)} />;
    }
  },

  htmlToStyle(nodeName, node, currentStyle) {
    if (node.dataset.msn) {
      return currentStyle.add(node.dataset.msn);
    }

    let nextStyle = currentStyle;
    if (node.style.color) {
      nextStyle = nextStyle.add(`${COLOR_STYLE_PREFIX}${node.style.color}`);
    }
    if (node.style.fontSize) {
      nextStyle = nextStyle.add(`${FONTSIZE_STYLE_PREFIX}${node.style.fontSize}`);
    }
    return nextStyle;
  },
};

const createTextSizePlugin = () => {
  return {
    customStyleFn,
  };
};

export default createTextSizePlugin;
