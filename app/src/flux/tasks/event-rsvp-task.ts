import { Task } from './task';
import { Event } from '../models/event';

export class EventRSVPTask extends Task {
  event: Event;
  RSVPEmail: string;
  RSVPResponse: string;

  constructor(event: Event, RSVPEmail: string, RSVPResponse: string) {
    super({});
    this.event = event;
    this.RSVPEmail = RSVPEmail;
    this.RSVPResponse = RSVPResponse;
  }

  performLocal() {}

  onOtherError() {
    return Promise.resolve();
  }

  onTimeoutError() {
    return Promise.resolve();
  }
}
