export default {
    title: 'config schema',
    version: 0,
    description: 'describes a config',
    type: 'object',
    properties: {
        key: {
            type: 'string',
            primary: true,
        },
        value: {
            type: 'string'
            //primary: true,
        },
        time: {
            type: 'number'
        }
        // key: {
        //     type: 'string'
        // }
    },
    required: [
        'key'// will cause a Rx Error does not match schema, while name field is null.
    ]
};