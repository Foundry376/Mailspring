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

    if (longFormat) {
      return moment(timestamp).calendar(currentTime, longFormat ? LONG_FORMATS : SHORT_FORMATS);
    }
    // if yestoday, don't display
    var d = new Date();
    if (timestamp < d.setHours(0, 0, 0, 0)) {
      return moment(timestamp).fromNow();
    }
    return moment(timestamp).format('HH:mm');
  };
};

const DAY_LABEL_FORMATS = {
  sameDay: '[Today]',
  lastDay: '[Yesterday]',
  sameWeek: 'ddd, MMMM Do YYYY',
  lastWeek: 'ddd, MMMM Do YYYY',
  nextWeek: 'ddd, MMMM Do YYYY',
  sameElse: 'ddd, MMMM Do YYYY',
};
export const dateFormat = (timestamp, format) => {
  const currentTime = new Date().getTime();
  if (typeof timestamp === 'string') {
    timestamp = parseInt(timestamp);
  }
  if (format) {
    return moment(timestamp).format(format);
  }
  const str =  moment(timestamp).calendar(currentTime, DAY_LABEL_FORMATS);
  console.log('dbg*** dateFormat str: ', currentTime, str);
  return str;

}
export const dateFormatDigit = (timestamp, format) => {
  const currentTime = new Date().getTime();
  if (typeof timestamp === 'string') {
    timestamp = parseInt(timestamp);
  }
  if (format) {
    return moment(timestamp).format(format);
  }
  const str = moment(timestamp).format('MMM d');
  console.log('dbg*** dateFormatDigit str: ', currentTime, str);
  return str;
}

export default {
  buildTimeDescriptor,
  dateFormat
};
