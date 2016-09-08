// A wrapper for Promises. Implements the constructor, .then(), .any(), and adds
// on an .abort() method.
// base - can be either a resolver function, like that passed into the Promise
//   constructor, or it can be a Promise.
// onAbort - must be a function (and it's up to you to make sure it actually
//   aborts things sufficiently)
//
// A common pattern for implementing the abort function is to actually implement
// it within the resolver function, but have a reference to it in an outer scope:
//
//   let myAbort;
//   return new AbortablePromise((resolve) => {
//      const x = doSomethingThatCanBeCanceled();
//      myAbort = x.cancel;
//   }, () => { if (myAbort) { myAbort(); } })
//
//  Note that the onAbort parameter can't simply be myAbort, because it would be
//  undefined at that time. It could just be () => { myAbort(); } if you're
//  reasonably confident that it will have been assigned by the time it might
//  be called, but there are cases where it won't be, so including the conditional
//  is safest. (Or you could make the initial value of myAbort an identity
//  function instead of undefined.)
//
// Aborting an AbortablePromise will leave the underlying Promise unfulfilled
// forever, but the internet seems to think this is fine.
class AbortablePromise {
  constructor(base, onAbort) {
    if (typeof(base) === "function") {
      this.promise = new Promise(base)
    } else if (base instanceof Promise) {
      this.promise = base;
    } else {
      throw new Error(`base parameter for AbortablePromise must be a function or Promise, got: ${base}`);
    }

    if (typeof(onAbort) !== "function") {
      throw new Error(`onAbort parameter for AbortablePromise must be a function, got: ${onAbort}`);
    }
    this._onAbort = onAbort;
    this.aborted = false;
  }

  abort = () => {
    if (!this.aborted) {
      this._onAbort();
      this.aborted = true;
    } else {
      console.warn("AbortablePromise aborted more than once")
    }
  }

  then = (resolver) => {
    // The new abort function should attempt to abort both the original
    // AbortablePromise and the next one (if there is a next one)

    // Callback to get the abort function for the next AbortablePromise
    let onAbort;
    const wrappedResolver = (...args) => {
      const returnValue = resolver(...args);
      if (returnValue instanceof AbortablePromise) {
        onAbort = returnValue.abort;
      }
      return returnValue;
    }

    // Combine the two
    return new AbortablePromise(this.promise.then(wrappedResolver), () => {
      this.abort();
      if (onAbort) {
        onAbort();
      }
    });
  }

  static any = (apList) => {
    let abortAll;
    return new AbortablePromise((resolve) => {
      let resolved = false;
      const modifiedApList = []
      abortAll = () => {
        for (const ap of modifiedApList) {
          ap.abort();
        }
      }

      for (const ap of apList) {
        modifiedApList.push(ap.then((...args) => {
          if (!resolved) {
            resolved = true;
            resolve(...args);
            abortAll();
          }
        }));
      }
    }, () => { if (abortAll) { abortAll(); } });
  }
}

const TutorialUtils = {
  AbortablePromise,

  // Poll for an element until it is found, based on it's tutorialId attribute
  // or a generic HTML query selector.
  findElement: (identifier) => {
    if (typeof(identifier) === 'string') {
      return document.querySelector(`[data-tutorial-id='${identifier}']`) || document.querySelector(identifier);
    } else if (identifier instanceof HTMLElement) {
      return identifier;
    }
    throw new Error(`Couldn't parse element identifier: ${identifier}`);
  },

  resolveElement: (identifier) => {
    let timeout;
    const resolver = (resolve) => {
      function pollForElement() {
        const elem = TutorialUtils.findElement(identifier);
        if (elem) {
          resolve(elem);
        } else {
          timeout = setTimeout(pollForElement, 250);
        }
      }
      pollForElement();
    }

    return new AbortablePromise(resolver, () => { clearTimeout(timeout); });
  },

  // Resolves once the user has clicked the specified element
  // Params follow the same spec as findElementIfNecessary();
  waitForClick: (identifier, generalSelector = false) => {
    return TutorialUtils.findElementIfNecessary(identifier, generalSelector)
      .then((elem) => {
        let onAbort;
        const resolver = (resolve) => {
          // Resolves and removes the listener so that it is only fired once
          const singleCallback = (args) => {
            elem.removeEventListener('click', singleCallback);
            resolve(args);
          }
          // Removes the listener without resolving
          onAbort = () => {
            elem.removeEventListener('click', singleCallback);
          }

          elem.addEventListener('click', singleCallback);
        }
        return new AbortablePromise(resolver, () => { if (onAbort) { onAbort(); } });
      })
  },
}

export default TutorialUtils;
