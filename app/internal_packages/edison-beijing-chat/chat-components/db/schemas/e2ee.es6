export default {
    title: 'e2ee schema',
    version: 0,
    description: 'describes a e2ee',
    type: 'object',
    properties: {
        jid: {
            type: 'string',
            primary: true,
        },
        devices: {
            type: 'string'
            //primary: true,
        }
        // key: {
        //     type: 'string'
        // }
    },
    required: [
        //'devices'// will cause a Rx Error does not match schema, while name field is null.
    ]
};