## Translate

A package for Mailspring that translates message bodies, subjects, and drafts locally through an OpenAI-compatible LM Studio server.

Configure the server and loaded model in Preferences → LM Studio. The default endpoint is `http://127.0.0.1:1234/v1`; the plugin uses `/models` and `/chat/completions`. Original messages are never modified or uploaded to Mailspring.

<img src="https://raw.githubusercontent.com/nylas/nylas-mail/master/internal_packages/translation/examples-screencap-translate.png"/>

#### Enable this plugin

1. Download and run Mailspring

2. Navigate to Preferences > Plugins and click "Enable" beside the plugin.
