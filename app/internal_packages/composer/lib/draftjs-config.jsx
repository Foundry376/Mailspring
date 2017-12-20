import React from 'react';
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
    htmlToBlock: (nodeName, node) => {
      if (nodeName === 'img') {
        return {
          type: 'atomic',
          data: {},
        };
      }
    },
    htmlToEntity: (nodeName, node, createEntity) => {
      if (nodeName === 'a') {
        return createEntity('LINK', 'MUTABLE', { url: node.getAttribute('href') });
      }
      if (nodeName === 'img') {
        return createEntity('image', 'IMMUTABLE', {
          fileId: node
            .getAttribute('src')
            .split('cid:')
            .pop(),
        });
      }
    },
  })(html);
}

export function convertToHTML(contentState) {
  return DraftConvert.convertToHTML({
    styleToHTML: style => {
      switch (style) {
        case 'BOLD':
          return <strong />;
        case 'ITALIC':
          return <em />;
        case 'UNDERLINE':
          return <u />;
        case 'CODE':
          return <code />;
        default:
          return <span data-msn={style} style={customStyleFn(style)} />;
      }
    },
    blockToHTML: block => {
      switch (block.type) {
        case 'unstyled':
          return <p />;
        case 'paragraph':
          return <p />;
        case 'header-one':
          return <h1 />;
        case 'header-two':
          return <h2 />;
        case 'header-three':
          return <h3 />;
        case 'header-four':
          return <h4 />;
        case 'header-five':
          return <h5 />;
        case 'header-six':
          return <h6 />;
        case 'blockquote':
          return <blockquote />;
        case 'unordered-list-item':
          return {
            element: <li />,
            nest: <ul />,
          };
        case 'ordered-list-item':
          return {
            element: <li />,
            nest: <ol />,
          };
        case 'media':
          return <figure />;
        case 'atomic':
          return {
            start: '',
            end: '',
          };
        default:
          return '';
      }
    },
    entityToHTML: (entity, originalText) => {
      switch (entity.type) {
        case 'LINK':
          return <Link data={entity.data}>{originalText}</Link>;
        case 'image':
          return {
            empty: `<img alt="" src="cid:${entity.data.fileId}" />`,
            start: `<img alt="" src="cid:${entity.data.fileId}" />`,
            end: '',
          };
        default:
          debugger;
          return originalText;
      }
    },
  })(contentState);
}
