export const combineShortcuts = (...shortcutActionMaps) => Object.assign({}, ...shortcutActionMaps);

export const validateShorcutActionMap = shortcutActionMap => {
  if (typeof shortcutActionMap !== 'object') {
    throw Error('shortcutActionMap must be an object');
  }

  const problemKeys = [];
  Object.entries(shortcutActionMap)
    .forEach(([key, value]) => typeof value !== 'function' && problemKeys.push(key));
  if (problemKeys.length > 0) {
    const keys = problemKeys.join(', ');
    throw Error(`${keys} must be functions (action creators)`);
  }
  return true;
};

/**
 * Creates a moustrap middleware that dispatches actions when shorcuts defined are triggered.
 * @param   {Mousetrap} mousetrap           Mousetrap
 * @param   {Object}    shortcutActionMap   An object that maps shortcuts to redux action creators
 * @throws  {Error}                         Throws an error when the provided shortcutActionMap is
 *                                          poorly formatted
 * @returns {Middleware}                    Returns a redux middleware that dispatches actions when
 *                                          a predefined shortcut is triggered
 */
export const createMousetrapMiddleware = (mousetrap, shortcutActionMap) => {
  return store => {
    Object.entries(shortcutActionMap)
      .forEach(([shortcut, actionCreator]) =>
        mousetrap.bind(shortcut, () => actionCreator())
      );
    return next => action => next(action);
  };
};

export default createMousetrapMiddleware;
