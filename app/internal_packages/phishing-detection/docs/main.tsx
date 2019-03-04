// # Phishing Detection
//
// This is a simple package to notify N1 users if an email is a potential
// phishing scam.

// You can access Mailspring dependencies by requiring 'mailspring-exports'
import React from 'react';
import {
  PropTypes,
  // The ComponentRegistry manages all React components in N1.
  ComponentRegistry,
  // A `Store` is a Flux component which contains all business logic and data
  // models to be consumed by React components to render markup.
  MessageStore,
} from 'mailspring-exports';

class PhishingIndicator extends React.Component {
  // Adding a @displayName to a React component helps for debugging.
  static displayName = 'PhishingIndicator';

  // @propTypes is an object which validates the datatypes of properties that
  // this React component can receive.
  static propTypes = { thread: PropTypes.object.isRequired };

  // A React component's `render` method returns a virtual DOM element described
  // in CJSX. `render` is deterministic: with the same input, it will always
  // render the same output. Here, the input is provided by @isPhishingAttempt.
  // `@state` and `@props` are popular inputs as well.
  render() {
    // Our inputs for the virtual DOM to render come from @isPhishingAttempt.
    const [from, reply_to] = this.isPhishingAttempt();

    // We add some more application logic to decide how to render.
    if (from !== null && reply_to !== null) {
      return (
        <div className="phishingIndicator">
          <strong>This message looks suspicious!</strong>
          <p>{`It originates from ${from} but replies will go to ${reply_to}`}</p>
        </div>
      );
    }
    // If you don't want a React component to render anything at all, then your
    // `render` method should return `null` or `undefined`.
    return null;
  }

  isPhishingAttempt() {
    // In this package, the MessageStore is the source of our data which will be
    // the input for the `render` function. @isPhishingAttempt is performing some
    // domain-specific application logic to prepare the data for `render`.
    const message = MessageStore.items()[0];

    // This package's strategy to ascertain whether or not the email is a
    // phishing attempt boils down to checking the `replyTo` attributes on
    // `Message` models from `MessageStore`.
    if (message.replyTo != null && message.replyTo.length !== 0) {
      // The `from` and `replyTo` attributes on `Message` models both refer to
      // arrays of `Contact` models, which in turn have `email` attributes.
      const from = message.from[0].email;
      const reply_to = message.replyTo[0].email;

      // This is our core logic for our whole package! If the `from` and
      // `replyTo` emails are different, then we want to show a phishing warning.
      if (reply_to !== from) {
        return [from, reply_to];
      }
    }

    return [null, null];
  }
}

// Activate is called when the package is loaded. If your package previously
// saved state using `serialize` it is provided.
export function activate(state) {
  // This is a good time to tell the `ComponentRegistry` to insert our
  // React component into the `'MessageListHeaders'` part of the application.
  this.state = state;
  ComponentRegistry.register(PhishingIndicator, { role: 'MessageListHeaders' });
}

// Serialize is called when your package is about to be unmounted.
// You can return a state object that will be passed back to your package
// when it is re-activated.
export function serialize() {}

// This **optional** method is called when the window is shutting down,
// or when your package is being updated or disabled. If your package is
// watching any files, holding external resources, providing commands or
// subscribing to events, release them here.
export function deactivate() {
  ComponentRegistry.unregister(PhishingIndicator);
}
