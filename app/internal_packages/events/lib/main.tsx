import * as React from 'react';
import {
  Message,
  File,
  MessageViewExtension,
  ExtensionRegistry,
  ComponentRegistry,
} from 'mailspring-exports';
import { EventHeader } from './event-header';

function bestICSAttachment(files: File[]) {
  return (
    files.find(f => f.filename.endsWith('.ics')) ||
    files.find(f => f.contentType === 'text/calendar') ||
    files.find(f => f.filename.endsWith('.vcs'))
  );
}

const EventHeaderContainer: React.FunctionComponent<{ message: Message }> = ({ message }) => {
  const icsFile = bestICSAttachment(message.files);
  return icsFile ? <EventHeader key={icsFile.id} message={message} file={icsFile} /> : null;
};

EventHeaderContainer.displayName = 'EventHeaderContainer';

class HideICSAttachmentExtension extends MessageViewExtension {
  static filterMessageFiles({ message, files }: { message: Message; files: File[] }): File[] {
    const best = bestICSAttachment(message.files);
    if (!best) return files;

    // Many automatic invite emails attach the ICS file more than once using different mimetypes
    // to ensure it's recognized everywhere, so we remove all the attachments with the exact
    // file size and an ics content type.
    return files.filter(
      f => !(f.size === best.size && ['application/ics', 'text/calendar'].includes(f.contentType))
    );
  }
}

export function activate() {
  ExtensionRegistry.MessageView.register(HideICSAttachmentExtension);
  ComponentRegistry.register(EventHeaderContainer, { role: 'message:BodyHeader' });
}

export function deactivate() {
  ExtensionRegistry.MessageView.unregister(HideICSAttachmentExtension);
  ComponentRegistry.unregister(EventHeaderContainer);
}
