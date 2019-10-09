export default class TrackingAppEvents {
  static NewCompose = accountId => {
    var params = {};
    params['accountId'] = accountId;
    FB.AppEvents.logEvent('NewCompose', null, params);
  };
  static SendMessage = accountId => {
    var params = {};
    params['accountId'] = accountId;
    FB.AppEvents.logEvent('SendMessage', null, params);
  };
}
