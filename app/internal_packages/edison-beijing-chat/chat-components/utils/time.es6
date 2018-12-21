import moment from 'moment';

const SHORT_FORMATS = {
  lastDay: '[Yesterday]',
  sameDay: 'LT',
  nextDay: 'l',
  lastWeek: 'ddd',
  nextWeek: 'l',
  sameElse: 'l',
};

const LONG_FORMATS = {
  lastDay: '[Yesterday,] LT',
  sameDay: 'LT',
  nextDay: 'l[,] LT',
  lastWeek: 'ddd[,] LT',
  nextWeek: 'l[,] LT',
  sameElse: 'l[,] LT',
};

/**
 * Builds a function that produces a description for a given timestamp. For example, 12.34 PM.
 * @param   {number} currentTime  The current date to use as a baseline comparison
 * @throws  {Error}               Throws an error when param `currentTime` is not a positive number
 * @returns {number => string}    A function that converts
 */
export const buildTimeDescriptor = (currentTime = new Date().getTime()) => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (typeof currentTime !== 'number' || currentTime <= 0) {
    throw Error('Invalid argument type for param `currentDate`');
  }
  /**
   * Produces a description for a given `timestamp`
   * @param   {number}  timestamp   The `timestamp` to be described
   * @param   {boolean} longFormat  Indicates if the time should be included for longer dates
   *                                (defaults to false)
   * @throws  {Error}               Throws an error when `timestamp` is not a positive number
   * @returns {string}              The description of the `timestamp`
   */
  return (timestamp, longFormat = false) => {
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      throw Error('Invalid argument for param `timestamp`: must be a positive number');
    }

    // return moment(timestamp).calendar(currentTime, longFormat ? LONG_FORMATS : SHORT_FORMATS);
    // if yestoday, don't display
    var d = new Date();
    if (timestamp < d.setHours(0, 0, 0, 0)) {
      const now = new Date().getTime();
      const timegap = now - timestamp;
      if (timegap < DAY) {
        return Math.round(timegap / HOUR) + 'H';
      } else {
        return Math.round(timegap / HOUR) + 'D';
      }
    }
    return moment(timestamp).format('hh:mm')
  };
};

export default {
  buildTimeDescriptor
};
