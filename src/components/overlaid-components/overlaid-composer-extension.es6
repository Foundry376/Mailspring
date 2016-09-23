import React from 'react'
import ReactDOMServer from 'react-dom/server'
import ComposerExtension from '../../extensions/composer-extension'
import OverlaidComponents from './overlaid-components'
import CustomContenteditableComponents from './custom-contenteditable-components'

export default class OverlaidComposerExtension extends ComposerExtension {

  static applyTransformsToBody({fragment, draft}) {
    const overlayImgEls = Array.from(fragment.querySelector('img[data-overlay-id]'));
    for (const imgEl of overlayImgEls) {
      const Component = CustomContenteditableComponents.get(imgEl.dataset.componentKey);
      if (!Component) {
        continue;
      }

      const props = Object.assign({draft, isPreview: true}, imgEl.dataset.componentProps);
      const reactElement = React.createElement(Component, props);

      const overlayEl = document.createElement('overlay');
      overlayEl.innerHTML = ReactDOMServer.renderToStaticMarkup(reactElement);
      Object.assign(overlayEl.dataset, imgEl.dataset);

      imgEl.parentNode.replaceChild(overlayEl, imgEl);
    }
  }

  static unapplyTransformsToDraft({fragment}) {
    const overlayEls = Array.from(fragment.querySelector('overlay[data-overlay-id]'));
    for (const overlayEl of overlayEls) {
      const {componentKey, componentProps, overlayId, style} = overlayEl.dataset;
      const {anchorTag} = OverlaidComponents.buildAnchorTag(componentKey, componentProps, overlayId, style);
      const anchorFragment = document.createRange().createContextualFragment(anchorTag);
      overlayEl.parentNode.replaceChild(anchorFragment, overlayEl);
    }
  }
}
