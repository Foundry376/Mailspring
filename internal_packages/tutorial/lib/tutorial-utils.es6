const TutorialUtils = {
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
}

export default TutorialUtils;
