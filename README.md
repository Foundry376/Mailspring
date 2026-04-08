# 💌 Postra

**Postra is a new version of Nylas Mail maintained by one of the original authors. It's faster, leaner, and shipping today!** It replaces the JavaScript sync code in Nylas Mail with a new C++ sync engine based on [Mailcore2](https://github.com/MailCore/mailcore2). It uses roughly half the RAM and CPU of Nylas Mail and idles with almost zero "CPU Wakes", which translates to great battery life. It also has an entirely revamped composer and other great new features.

Postra's UI is open source (GPLv3) and written in TypeScript with [Electron](https://github.com/atom/electron) and [React](https://facebook.github.io/react/) - it's built on a plugin architecture and was designed to be easy to extend. Check out [CONTRIBUTING.md](https://github.com/fcools/postra-mail/blob/master/CONTRIBUTING.md) to get started!

Postra's sync engine is spawned by the Electron application and runs locally on your computer. [It is open source (GPLv3) and written in C++ and C.](https://github.com/fcools/postra-mail/tree/master/mailsync) For convenience, however, when you set up your development environment, Postra uses the latest version of the sync engine we've shipped for your platform so you don't need to pull sources or install its compile-time dependencies.

![Postra Screenshot](https://github.com/fcools/postra-mail/raw/master/screenshots/hero_graphic_mac%402x.png)

## Features

Postra comes packed with powerful features like Unified Inbox, Snooze, Send
Later, Mail Rules, Templates and more. Postra Pro, which you can unlock
with a monthly subscription, adds even more features for people who send a ton
of email: link tracking, read receipts, mailbox analytics, contact and company
profiles. **All of these features run in the client - Postra does not send
your email credentials to the cloud.** For a full list of features, check out
[getmailspring.com](https://getmailspring.com/).

## Download Postra

You can download compiled versions of Postra for Windows, Mac OS X, and
Linux (deb, rpm and snap) from
[https://getmailspring.com/download](https://getmailspring.com/download).

## Getting Help

You can find community-based help and discussion with other Postra users on our
[Discourse community](https://community.getmailspring.com/).

## Contributing

Postra is entirely open-source. Pull requests and contributions are
welcome! There are three ways to contribute: building a plugin, building a
theme, and submitting pull requests to the project itself. When you're getting
started, you may want to join our
[Discourse](https://community.getmailspring.com/) so you can ask questions and
learn from other people doing development.

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

### Running Postra from Source

To install all dependencies and run Postra from its source code,
run the following commands from the root directory of the Postra repository:

```
export npm_config_arch=x64 # If you are on an M1 / Apple Silicon Mac
npm install
npm start
```

You can attach command line parameters by separating them using a double hyphen:

```
npm start -- --help
```

### OAuth Client Overrides (Google / Microsoft)

Postra's onboarding supports overriding built-in OAuth app IDs via environment
variables. This is useful if you want your fork (for example, Postra) to use your
own OAuth applications and branding on provider consent screens.

Supported variables (checked in this order):

- Gmail client ID: `POSTRA_GMAIL_CLIENT_ID`, `GMAIL_CLIENT_ID`, `MS_GMAIL_CLIENT_ID`
- Gmail client secret: `POSTRA_GMAIL_CLIENT_SECRET`, `GMAIL_CLIENT_SECRET`, `MS_GMAIL_CLIENT_SECRET`
- Microsoft client ID: `POSTRA_O365_CLIENT_ID`, `O365_CLIENT_ID`, `MS_O365_CLIENT_ID`

Example:

```bash
export POSTRA_GMAIL_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
export POSTRA_GMAIL_CLIENT_SECRET="your-google-client-secret"
export POSTRA_O365_CLIENT_ID="your-microsoft-client-id"
npm start
```

### Building Postra

To build Postra, you need to run the following command from the root directory
of the Postra repository:

```
npm run-script build
```

### Building A Plugin

Plugins lie at the heart of Postra and give it its powerful features.
Building your own plugins allows you to integrate the app with other tools,
experiment with new workflows, and more. Follow the [Getting Started
guide](./docs/creating-composer-plugins.md) to write your first plugin in
five minutes.

- To create your own theme, check out the
  [Postra-Theme-Starter](https://github.com/fcools/postra-mail-Theme-Starter).

- To create your own plugin, check out the
  [Postra-Plugin-Starter](https://github.com/fcools/postra-mail-Plugin-Starter).

A plugin "store" like the Chrome Web Store is coming soon, and will make it
easy for other users to discover plugins you create. (Right now, users need to
"sideload" the plugins into the app by downloading them and copying them into
place.)

You can share and browse Postra Plugins, and discuss plugin development
with other developers, on our
[Discourse](https://community.getmailspring.com/).

### Building a Theme

The Postra user interface is styled using CSS, which means it's easy to
modify and extend. Postra comes stock with a few beautiful themes, and
there are many more which have been built by community developers. To start
creating a theme, [clone the theme starter](https://github.com/fcools/postra-mail-Theme-Starter)!

If you are updating an existing Nylas theme for Postra here is a
[step by step tutorial](https://community.getmailspring.com/t/updating-an-n1-nylas-mail-theme-for-mailspring/195).
Notice: as part of the update process you will probably need to [import mailspring base variables](https://github.com/fcools/postra-mail/issues/326#issuecomment-343757775).

You can share and browse Postra Themes, and discuss theme development with other developers, on our [Discourse](https://community.getmailspring.com/).

### Localizing / Translating

Postra (1.5.0 and above) supports localization. If you're a fluent speaker of
another language, we'd love your help improving translations. Check out the
[LOCALIZATION](https://github.com/fcools/postra-mail/blob/master/LOCALIZATION.md)
guide for more information. You can discuss localization and translation with
other developers on our [Discourse](https://community.getmailspring.com/).

### Contributing to Postra Core

Pull requests are always welcome - check out
[CONTRIBUTING](https://github.com/fcools/postra-mail/blob/master/CONTRIBUTING.md)
for more information about setting up the development environment, running
tests locally, and submitting pull requests.
