# 💌 Mailspring

[![Travis Status](https://travis-ci.org/Foundry376/Mailspring.svg?branch=master)](https://travis-ci.org/Foundry376/Mailspring)
[![AppVeyor Status](https://ci.appveyor.com/api/projects/status/iuuuy6d65u3x6bj6?svg=true)](https://ci.appveyor.com/project/Foundry376/Mailspring)
[![Mailspring Slack](https://join-mailspring-slack.herokuapp.com/badge.svg)](https://join-mailspring-slack.herokuapp.com/)

**Leaving Nylas Mail? Mailspring is a new version by one of the original authors. It's faster, leaner, and shipping today!** Mailspring replaces the JavaScript mailsync code in Nylas Mail with a new C++ sync engine based on [Mailcore2](https://github.com/MailCore/mailcore2). It uses roughly half the RAM and CPU of Nylas Mail and idles with almost zero "CPU Wakes", which translates to great battery life. A major overhaul of the package manager and dependency tree mean it launches faster too. You might not even notice it's an Electron app!

Mailspring is built on the modern web with [Electron](https://github.com/atom/electron), [React](https://facebook.github.io/react/), and [Flux](https://facebook.github.io/flux/). It is designed to be extensible, so it's easy to create new experiences and workflows around email. Want to learn more? Check out [CONTRIBUTING.md](https://github.com/Foundry376/Mailspring/blob/master/CONTRIBUTING.md).

![Mailspring Screenshot](https://github.com/Foundry376/Mailspring/raw/master/screenshots/hero_graphic_mac%402x.png)

## Features

Mailspring comes packed with powerful features like Unified Inbox, Snooze, Send Later, Mail Rules, Templates and more. Mailspring Pro, which you can unlock with a monthly subscription, adds even more features for people who send a ton of email: link tracking, read receipts, mailbox analytics, contact and company profiles. **All of these features run in the client - Mailspring does not send your email credentials to the cloud.** For a full list of features, check out [getmailspring.com](https://getmailspring.com/).

## Download Mailspring

You can download compiled versions of Mailspring for Windows, Mac OS X, and Linux (deb, rpm and snap) from [https://getmailspring.com/download](https://getmailspring.com/download).

## Contributing

Mailspring's UI is entirely open-source and pull requests and contributions are welcome! There are three ways to contribute: building a plugin, building a theme, and submitting pull requests to the project itself. When you're getting started, you may want to join our [public slack](https://join-mailspring-slack.herokuapp.com/) so you can ask questions and learn from other people doing development.

### Building A Plugin

Plugins lie at the heart of Mailspring and give it its powerful features. Building your own plugins allows you to integrate the app with other tools, experiment with new workflows, and more. Follow the [Getting Started guide](https://Foundry376.github.io/Mailspring/) to write your first plugin in five minutes. To create your own theme, go to our [Theme Starter guide](https://github.com/Foundry376/Mailspring-Theme-Starter).

A plugin "store" like the Chrome Web Store is coming soon, and will make it easy for other users to discover plugins you create.

### Building a Theme

The Mailspring user interface is styled using CSS, which means it's easy to modify and extend. Mailspring comes stock with a few beautiful themes, and there are many more which have been built by community developers. To start creating a theme, [clone the theme starter](https://github.com/Foundry376/Mailspring-Theme-Starter)!

If you are updating an existing Nylas theme for Mailspring here is a [step by step tutorial](https://foundry376.zendesk.com/hc/en-us/articles/115001918391-How-do-I-update-an-N1-Nylas-Mail-theme-for-Mailspring-). Notice: as part of the update process you will probably need to [import mailspring base variables](https://github.com/Foundry376/Mailspring/issues/326#issuecomment-343757775).

### Contributing to Mailspring Core

Pull requests are always welcome - check out [CONTRIBUTING](https://github.com/Foundry376/Mailspring/blob/master/CONTRIBUTING.md) for more information about setting up the development environment, running tests locally, and submitting pull requests.
