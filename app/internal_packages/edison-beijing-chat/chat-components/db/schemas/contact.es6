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
    curJid: {
      type: 'string',
    },
    name: {
      type: 'string',
      indexed: true,
    },
    nickname: {
      type: 'string',
    },
    email: {
      type: 'string'
    },
    avatar: {
      type: 'string'
    }
  },
  required: [
    'name'// will cause a Rx Error does not match schema, while name field is null.
  ],
};
