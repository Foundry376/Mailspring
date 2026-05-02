import _ from 'underscore';

const DOMUtils = {
  findLastTextNode(node: Node) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const childNode = node.childNodes[i];
      if (childNode.nodeType === Node.TEXT_NODE) {
        return childNode;
      } else if (childNode.nodeType === Node.ELEMENT_NODE) {
        return DOMUtils.findLastTextNode(childNode);
      } else {
        continue;
      }
    }
    return null;
  },

  findFirstTextNode(node: Node) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }
    for (const childNode of node.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        return childNode;
      } else if (childNode.nodeType === Node.ELEMENT_NODE) {
        return DOMUtils.findFirstTextNode(childNode);
      } else {
        continue;
      }
    }
    return null;
  },

  escapeHTMLCharacters(text: string) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  },

  // Checks to see if a particular node is visible and any of its parents
  // are visible.
  //
  // WARNING. This is a fairly expensive operation and should be used
  // sparingly.
  nodeIsVisible(node: Node) {
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(node as Element);
      node = node.parentNode;
      if (style == null) {
        continue;
      }
      const isInvisible =
        [0, '0'].includes(style.opacity) ||
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        [0, '0', '0px'].includes(style.width) ||
        [0, '0', '0px'].includes(style.height);
      if (isInvisible) {
        return false;
      }
    }
    return true;
  },

  // This checks for the `offsetParent` to be null. This will work for
  // hidden elements, but not if they are in a `position:fixed` container.
  //
  // It is less thorough then Utils.nodeIsVisible, but is ~16x faster!!
  // http://jsperf.com/check-hidden
  // http://stackoverflow.com/a/21696585/793472
  nodeIsLikelyVisible(node: HTMLElement) {
    return node.offsetParent !== null;
  },

  commonAncestor(nodes: NodeList | Node[], parentFilter?: (node: Node) => boolean) {
    if (nodes == null) {
      return null;
    }
    if (nodes.length === 0) {
      return null;
    }

    const nodesArray: Node[] = Array.prototype.slice.call(nodes);

    let minDepth = Number.MAX_VALUE;
    // Sometimes we can potentially have tons of REALLY deeply nested
    // nodes. Since we're looking for a common ancestor we can really speed
    // this up by keeping track of the min depth reached. We know that we
    // won't need to check past that.
    const getParents = function (node) {
      const parentNodes = [node];
      let depth = 0;
      while ((node = node.parentNode)) {
        if (parentFilter) {
          if (parentFilter(node)) {
            parentNodes.unshift(node);
          }
        } else {
          parentNodes.unshift(node);
        }
        depth += 1;
        if (depth > minDepth) {
          break;
        }
      }
      minDepth = Math.min(minDepth, depth);
      return parentNodes;
    };

    // _.intersection will preserve the ordering of the parent node arrays.
    // parents are ordered top to bottom, so the last node is the most
    // specific common ancenstor
    const result = _.intersection.apply(null, nodesArray.map(getParents));
    return result[result.length - 1];
  },

  scrollAdjustmentToMakeNodeVisibleInContainer(node: Element, container: Element) {
    if (!node) {
      return;
    }
    const nodeRect = node.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return this.scrollAdjustmentToMakeRectVisibleInRect(nodeRect, containerRect);
  },

  scrollAdjustmentToMakeRectVisibleInRect(nodeRect: DOMRect, containerRect: DOMRect) {
    const distanceBelowBottom =
      nodeRect.top + nodeRect.height - (containerRect.top + containerRect.height);
    if (distanceBelowBottom >= 0) {
      return distanceBelowBottom;
    }

    const distanceAboveTop = containerRect.top - nodeRect.top;
    if (distanceAboveTop >= 0) {
      return -distanceAboveTop;
    }

    return 0;
  },

  // Modifies the DOM to wrap the given range with a new node, of name nodeName.
  //
  // If the range starts or ends in the middle of an node, that node will be split.
  // This will likely break selections that contain any of the affected nodes.
  wrap(range: Range, nodeName: string) {
    const newNode = document.createElement(nodeName);
    try {
      range.surroundContents(newNode);
    } catch (error) {
      newNode.appendChild(range.extractContents());
      range.insertNode(newNode);
    }
    return newNode;
  },

  // Modifies the DOM to "unwrap" a given node, replacing that node with its contents.
  // This may break selections containing the affected nodes.
  // We don't use `document.createFragment` because the returned `fragment`
  // would be empty and useless after its children get replaced.
  unwrapNode(node: Element) {
    let child;
    if (node.childNodes.length === 0) {
      return node;
    }
    const replacedNodes = [];
    const parent = node.parentNode;
    if (parent == null) {
      return node;
    }

    let lastChild = node.childNodes[node.childNodes.length - 1];
    replacedNodes.unshift(lastChild);
    parent.replaceChild(lastChild, node);

    while ((child = node.childNodes[node.childNodes.length - 1])) {
      replacedNodes.unshift(child);
      parent.insertBefore(child, lastChild);
      lastChild = child;
    }

    return replacedNodes;
  },

  looksLikeBlockElement(node: Element) {
    return ['BR', 'P', 'BLOCKQUOTE', 'DIV', 'TABLE'].includes(node.nodeName);
  },

  getWorkspaceCssNumberProperty(property: string, defaultValue: number) {
    const workspaceElement = document.querySelector('mailspring-workspace');
    if (workspaceElement) {
      const value = getComputedStyle(workspaceElement).getPropertyValue(`--${property}`);
      if (value.length > 0) {
        const num = Number(value.replace('px', '').trim());
        if (!isNaN(num)) {
          return num;
        } else {
          console.warn(`Unable to interpret --${property}:${value}, provide a value in px.`);
        }
      }
    }

    return defaultValue;
  },
};

export default DOMUtils;
