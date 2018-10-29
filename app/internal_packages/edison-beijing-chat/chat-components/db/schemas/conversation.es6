export default {
  title: 'conversation schema',
  version: 0,
  description: 'describes a conversation',
  type: 'object',
  properties: {
    jid: {
      type: 'string',
      primary: true
    },
    name: {
      type: 'string'
    },
    isGroup: {
      type: 'boolean'
    },
    unreadMessages: {
      type: 'number',
      min: 0
    },
    occupants: { // Jids of occupants
      type: 'array',
      // uniqueItems: true,
      item: {
        type: 'string'
      }
    },
    lastMessageTime: {
      type: 'number',
      min: 0
    },
    lastMessageText: {
      type: 'string'
    },
    lastMessageSender: { // Jid of last sender
      type: 'string'
    }
  },
  required: [
    'name',
    'isGroup',
    'unreadMessages',
    'occupants',
  ]
};
