marked = require 'marked'
Utils = require './utils'
{ComposerExtension} = require 'nylas-exports'

rawBodies = {}

class MarkdownComposerExtension extends ComposerExtension

  @applyTransformsToDraft: ({fragment, draft}) ->
    root = fragment.childNodes[0]
    rawBodies[draft.clientId] = root.innerHTML
    root.innerHTML = marked(root.innerText)

  @unapplyTransformsToDraft: ({fragment, draft}) ->
    if rawBodies[draft.clientId]
      root = fragment.childNodes[0]
      root.innerHTML = rawBodies[draft.clientId]

module.exports = MarkdownComposerExtension
