// This file contains custom Nylas error classes.
//
// In general I think these should be created as sparingly as possible.
// Only add one if you really can't use native `new Error("my msg")`

export class APIError extends Error {
  // We use a custom subclass for API errors because we don't want them
  // to be reported to the error monitoring service.
  constructor(...args) {
    super(...args);

    // Populated /if/ the request is executed and returns a status code.
    this.statusCode = null;
  }
}
