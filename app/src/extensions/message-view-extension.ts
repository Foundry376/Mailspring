import { Message } from '../flux/models/message';
import { File } from '../flux/models/file';

/*
Public: To create MessageViewExtension that customize message viewing, you
should create objects that implement the interface defined at {MessageViewExtension}.

To register your extension with the ExtensionRegistry, call {ExtensionRegistry::MessageView::registerExtension}.
When your package is being unloaded, you *must* call the corresponding
{ExtensionRegistry::MessageView::unregisterExtension} to unhook your extension.

```javascript
activate() {
  ExtensionRegistry.MessageView.register(MyExtension)
}
...

deactivate() {
  ExtensionRegistry.MessageView.unregister(MyExtension)
}
```

The MessageViewExtension API does not currently expose any asynchronous or {Promise}-based APIs.
This will likely change in the future. If you have a use-case for a Message Store extension that
is not possible with the current API, please let us know.

Section: Extensions
*/
export class MessageViewExtension {
  /*
  Public: Modify the body of the message provided. Note that you're provided
  the entire message object, but you can only change `message.body`.
  */
  static formatMessageBody({ message }: { message: Message }) {}

  /*
  Public: Modify the rendered message body using the DOM.
  Runs after messages goes through `formatMessageBody` and is placed
  into the DOM.
  */
  static renderedMessageBodyIntoDocument({ document, message, iframe }) {}

  /*
  Public: Filter the list of displayed attachments.
  */
  static filterMessageFiles({ message, files }: { message: Message; files: File[] }): File[] {
    return files;
  }
}
