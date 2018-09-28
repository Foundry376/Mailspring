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
    'name',
  ]
};
