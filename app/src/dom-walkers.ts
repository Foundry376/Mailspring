const DOMWalkers = {
  *walk(rootNode, ...treeWalkerArgs) {
    const walker = document.createTreeWalker(rootNode, ...treeWalkerArgs);
    let node = walker.nextNode();
    while (node) {
      yield node;
      node = walker.nextNode();
    }
    return;
  },

  *walkBackwards(node) {
    if (!node) {
      return;
    }
    if (node.childNodes.length > 0) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        yield* this.walkBackwards(node.childNodes[i]);
      }
    }
    yield node;
    return;
  },
};
export default DOMWalkers;
