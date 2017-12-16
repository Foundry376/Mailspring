import React from 'react';
import { CompositeDecorator } from 'draft-js';
import * as DraftConvert from 'draft-convert';

// Support for style keys that encode data (color-#ff0000)

export const COLOR_STYLE_PREFIX = 'color-';
export const FONTSIZE_STYLE_PREFIX = 'font-';

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

// Support for style

const styleMap = {
  CODE: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
    fontSize: 16,
    padding: 2,
  },
};

// style = string or immutable set
export function customStyleFn(style) {
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

export function blockStyleFn(block) {
  switch (block.getType()) {
    case 'blockquote':
      return 'RichEditor-blockquote';
    default:
      return null;
  }
}

// Inline Decorators

const Link = props => {
  const data = props.data || props.contentState.getEntity(props.entityKey).getData();
  const { url } = data;
  return (
    <a href={url} title={url}>
      {props.children}
    </a>
  );
};

function findLinkEntities(contentBlock, callback, contentState) {
  contentBlock.findEntityRanges(character => {
    const entityKey = character.getEntity();
    return entityKey !== null && contentState.getEntity(entityKey).getType() === 'LINK';
  }, callback);
}

export const decorator = new CompositeDecorator([
  {
    strategy: findLinkEntities,
    component: Link,
  },
]);

// Conversion to and from HTML

export function convertFromHTML(html) {
  return DraftConvert.convertFromHTML({
    htmlToStyle: (nodeName, node, currentStyle) => {
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
    htmlToEntity: (nodeName, node, createEntity) => {
      if (nodeName === 'a') {
        return createEntity('LINK', 'MUTABLE', { url: node.getAttribute('href') });
      }
    },
  })(html);
}

export function convertToHTML(contentState) {
  return DraftConvert.convertToHTML({
    styleToHTML: style => {
      return <span data-msn={style} style={customStyleFn(style)} />;
    },
    blockToHTML: block => {},
    entityToHTML: (entity, originalText) => {
      if (entity.type === 'LINK') {
        return <Link data={entity.data}>{originalText}</Link>;
      }
      return originalText;
    },
  })(contentState);
}
