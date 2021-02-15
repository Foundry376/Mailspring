import { Utils } from 'mailspring-exports';

export function calcColor(calendarId) {
  let bgColor = AppEnv.config.get(`calendar.colors.${calendarId}`);
  if (!bgColor) {
    const hue = Utils.hueForString(calendarId);
    bgColor = `hsla(${hue}, 80%, 45%, 0.55)`;
  }
  return bgColor;
}
