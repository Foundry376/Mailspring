_ = require 'underscore'

DOMUtils =
  findLastTextNode: (node) ->
    return null unless node
    return node if node.nodeType is Node.TEXT_NODE
    for childNode in node.childNodes by -1
      if childNode.nodeType is Node.TEXT_NODE
        return childNode
      else if childNode.nodeType is Node.ELEMENT_NODE
        return DOMUtils.findLastTextNode(childNode)
      else continue
    return null

  findFirstTextNode: (node) ->
    return null unless node
    return node if node.nodeType is Node.TEXT_NODE
    for childNode in node.childNodes
      if childNode.nodeType is Node.TEXT_NODE
        return childNode
      else if childNode.nodeType is Node.ELEMENT_NODE
        return DOMUtils.findFirstTextNode(childNode)
      else continue
    return null

  escapeHTMLCharacters: (text) ->
    map =
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    text.replace /[&<>"']/g, (m) -> map[m]

  # Checks to see if a particular node is visible and any of its parents
  # are visible.
  #
  # WARNING. This is a fairly expensive operation and should be used
  # sparingly.
  nodeIsVisible: (node) ->
    while node and node.nodeType is Node.ELEMENT_NODE
      style = window.getComputedStyle(node)
      node = node.parentNode
      continue unless style?
      isInvisible = (
        [0, "0"].includes(style.opacity) or
        style.visibility is "hidden" or
        style.display is "none" or
        [0, "0", "0px"].includes(style.width) or
        [0, "0", "0px"].includes(style.height)
      )
      if isInvisible
        return false
    return true

  # This checks for the `offsetParent` to be null. This will work for
  # hidden elements, but not if they are in a `position:fixed` container.
  #
  # It is less thorough then Utils.nodeIsVisible, but is ~16x faster!!
  # http://jsperf.com/check-hidden
  # http://stackoverflow.com/a/21696585/793472
  nodeIsLikelyVisible: (node) -> node.offsetParent isnt null

  commonAncestor: (nodes=[], parentFilter) ->
    return null if nodes.length is 0

    nodes = Array::slice.call(nodes)

    minDepth = Number.MAX_VALUE
    # Sometimes we can potentially have tons of REALLY deeply nested
    # nodes. Since we're looking for a common ancestor we can really speed
    # this up by keeping track of the min depth reached. We know that we
    # won't need to check past that.
    getParents = (node) ->
      parentNodes = [node]
      depth = 0
      while node = node.parentNode
        if parentFilter
          parentNodes.unshift(node) if parentFilter(node)
        else
          parentNodes.unshift(node)
        depth += 1
        if depth > minDepth then break
      minDepth = Math.min(minDepth, depth)
      return parentNodes

    # _.intersection will preserve the ordering of the parent node arrays.
    # parents are ordered top to bottom, so the last node is the most
    # specific common ancenstor
    _.last(_.intersection.apply(null, nodes.map(getParents)))

  scrollAdjustmentToMakeNodeVisibleInContainer: (node, container) ->
    return unless node
    nodeRect = node.getBoundingClientRect()
    containerRect = container.getBoundingClientRect()
    return @scrollAdjustmentToMakeRectVisibleInRect(nodeRect, containerRect)

  scrollAdjustmentToMakeRectVisibleInRect: (nodeRect, containerRect) ->
    distanceBelowBottom = (nodeRect.top + nodeRect.height) - (containerRect.top + containerRect.height)
    if distanceBelowBottom >= 0
      return distanceBelowBottom

    distanceAboveTop = containerRect.top - nodeRect.top
    if distanceAboveTop >= 0
      return -distanceAboveTop

    return 0

  # Modifies the DOM to wrap the given range with a new node, of name nodeName.
  #
  # If the range starts or ends in the middle of an node, that node will be split.
  # This will likely break selections that contain any of the affected nodes.
  wrap: (range, nodeName) ->
    newNode = document.createElement(nodeName)
    try
      range.surroundContents(newNode)
    catch
      newNode.appendChild(range.extractContents())
      range.insertNode(newNode)
    return newNode

  # Modifies the DOM to "unwrap" a given node, replacing that node with its contents.
  # This may break selections containing the affected nodes.
  # We don't use `document.createFragment` because the returned `fragment`
  # would be empty and useless after its children get replaced.
  unwrapNode: (node) ->
    return node if node.childNodes.length is 0
    replacedNodes = []
    parent = node.parentNode
    return node if not parent?

    lastChild = _.last(node.childNodes)
    replacedNodes.unshift(lastChild)
    parent.replaceChild(lastChild, node)

    while child = _.last(node.childNodes)
      replacedNodes.unshift(child)
      parent.insertBefore(child, lastChild)
      lastChild = child

    return replacedNodes

  looksLikeBlockElement: (node) ->
    return node.nodeName in ["BR", "P", "BLOCKQUOTE", "DIV", "TABLE"]

module.exports = DOMUtils
