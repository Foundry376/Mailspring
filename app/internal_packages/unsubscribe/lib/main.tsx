import * as React from 'react';
import {
  Message,
  ComponentRegistry,
} from 'mailspring-exports';
import { UnsubscribeHeader, UnsubscribeAction } from './unsubscribe-header';



function bestUnsubscribeAction(message): UnsubscribeAction {
  const unsubscribeAction: UnsubscribeAction = {
    unsubscribe() {
      console.log("Unsubscribing");
    }
  }
  return unsubscribeAction;
}

const UnsubscribeHeaderContainer: React.FunctionComponent<{ message: Message }> = ({ message }) => {
  console.log("Trying to display Unsubscribe Container")
  console.log(message);
  const unsubscribeAction = bestUnsubscribeAction(message)
  return unsubscribeAction ? <UnsubscribeHeader message={message} unsubscribeAction={unsubscribeAction} /> : null;
};

UnsubscribeHeaderContainer.displayName = 'UnsubscribeContainer';

export function activate() {
  ComponentRegistry.register(UnsubscribeHeaderContainer, { role: 'message:BodyHeader' });
}

export function deactivate() {
  ComponentRegistry.unregister(UnsubscribeHeaderContainer);
}
