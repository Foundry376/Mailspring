import {
  Actions,
  ComposerExtension,
} from 'nylas-exports'

/**
 * Inserts the set of Proposed Times into the body of the HTML email.
 *
 */
export default class ImageUploadComposerExtension extends ComposerExtension {

  static TAG_NAME = "inline-image";

  static editingActions() {
    return [{
      action: Actions.insertAttachmentIntoDraft,
      callback: ImageUploadComposerExtension._onInsertAttachmentIntoDraft,
    }, {
      action: Actions.removeAttachment,
      callback: ImageUploadComposerExtension._onRemovedAttachment,
    }]
  }

  static _onRemovedAttachment({editor, actionArg}) {
    const upload = actionArg;
    const el = editor.rootNode.querySelector(`.inline-container-${upload.id}`)
    if (el) {
      el.parentNode.removeChild(el);
    }
  }

  static _onInsertAttachmentIntoDraft({editor, actionArg}) {
    if (editor.draftClientId === actionArg.draftClientId) { return }

    editor.insertCustomComponent("ImageUploadInlineContainer", {
      className: `inline-container-${actionArg.uploadId}`,
      uploadId: actionArg.uploadId,
    })
  }

  static applyTransformsToDraft({draft}) {
    return draft;
  }

  static unapplyTransformsToDraft({draft}) {
    return draft
  }
}
