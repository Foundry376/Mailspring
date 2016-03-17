import {ComponentRegistry} from 'nylas-exports';
import EventInviteContainer from './event-invite'
import EventInviteButton from './event-invite-button';

export function activate() {
  console.log(EventInviteButton)
  ComponentRegistry.register(EventInviteContainer, {role: 'Composer:Footer'});
  ComponentRegistry.register(EventInviteButton, {role: 'Composer:ActionButton'});
}

export function deactivate() {
  ComponentRegistry.unregister(EventInviteContainer);
  ComponentRegistry.unregister(EventInviteButton);
}

export function serialize() {

}
