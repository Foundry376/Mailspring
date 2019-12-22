const Fields = {
  To: 'textFieldTo',
  Cc: 'textFieldCc',
  Bcc: 'textFieldBcc',
  List: 'textFieldToList',
  From: 'fromField',
  Spoof: 'fromSpoof',
  Subject: 'textFieldSubject',
  Body: 'contentBody',
  ParticipantFields: [],
  Order: {},
};

Fields.ParticipantFields = [Fields.To, Fields.List, Fields.Cc, Fields.Bcc];

Fields.Order = {
  textFieldTo: 1,
  textFiledToList: 2,
  textFieldCc: 3,
  textFieldBcc: 4,
  fromField: -1, // Not selectable
  fromSpoof: 5,
  textFieldSubject: 6,
  contentBody: 7,
};

export default Fields;
