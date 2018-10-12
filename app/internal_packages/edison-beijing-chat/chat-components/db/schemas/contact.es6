export default {
  title: 'contact schema',
  version: 0,
  description: 'describes a contact',
  type: 'object',
  properties: {
    jid: {
      type: 'string',
      primary: true,
    },
    name: {
      type: 'string',
      indexed: true,
    },
  },
  required: [
    //'name', // will cause a Rx Error does not match schema, while name field is null.
  ],
};
