# Community Plugins for Postra

This document lists known third-party plugins for Postra found on GitHub.

## Official Resources

| Repository | Description |
|------------|-------------|
| [fcools/postra-mail-Plugin-Starter](https://github.com/fcools/postra-mail-Plugin-Starter) | Official plugin template for creating your own plugins |

## Functional Plugins

### General Purpose

| Repository | Description | Stars |
|------------|-------------|-------|
| [Striffly/mailspring-avatars](https://github.com/Striffly/mailspring-avatars) | Adds avatars to contacts in Postra | ⭐76 |
| [bnesimsysadmin/AI-assistant-mailspring-plugin](https://github.com/bnesimsysadmin/AI-assistant-mailspring-plugin) | AI assistant for composing emails | - |
| [smartium/Mailspring-Plugin](https://github.com/smartium/Mailspring-Plugin) | Community plugin | - |

### Notifications & System Integration

| Repository | Description |
|------------|-------------|
| [ruslansin/launcher-api-support](https://github.com/ruslansin/launcher-api-support) | Adds Unity Launcher API dock notifications |
| [3nws/refresh-on-focus](https://github.com/3nws/refresh-on-focus) | Resync mail on window focus with 5 second cooldown |

### Productivity & Todo

| Repository | Description |
|------------|-------------|
| [jmanuel1/todoer](https://github.com/jmanuel1/todoer) | Automatically add starred emails to local todo.txt |

### Signatures

| Repository | Description |
|------------|-------------|
| [Raymo111/mailspring-plaintext-signatures](https://github.com/Raymo111/mailspring-plaintext-signatures) | Adds plaintext signature support |

### Calendar Integration

| Repository | Description |
|------------|-------------|
| [sham-sheer/edison-mail-calendar](https://github.com/sham-sheer/edison-mail-calendar) | Calendar with Google, Microsoft EWS, and CalDAV integration |
| [AbduT/ETCal-MailSpring](https://github.com/AbduT/ETCal-MailSpring) | Ethiopian Calendar plugin |

### Encryption / PGP

| Repository | Description |
|------------|-------------|
| [NgoHuy/mailspring-keybase](https://github.com/NgoHuy/mailspring-keybase) | Keybase PGP encryption plugin |
| [mirkoschubert/mailspring-pgp](https://github.com/mirkoschubert/mailspring-pgp) | Keybase PGP plugin |
| [dinoboy197/mailspring-openpgp](https://github.com/dinoboy197/mailspring-openpgp) | OpenPGP encryption plugin |

## Alternative Backends & Forks

These projects modify or replace Postra's backend services:

| Repository | Description | Stars |
|------------|-------------|-------|
| [1RandomDev/mailspring-api](https://github.com/1RandomDev/mailspring-api) | Self-hosted reimplementation of the Postra sync backend | ⭐11 |
| [notpushkin/Mailspring-Libre](https://github.com/notpushkin/Mailspring-Libre) | Libre build with no telemetry (archived) | - |
| [algv/Mailspring-Libre](https://github.com/algv/Mailspring-Libre) | Fork of Mailspring-Libre | - |
| [arthurzenika/Mailspring-Libre](https://github.com/arthurzenika/Mailspring-Libre) | Fork of Mailspring-Libre | - |
| [exprez135/Mailspring-Libre](https://github.com/exprez135/Mailspring-Libre) | Fork of Mailspring-Libre | - |
| [jlgarridol/Mailspring-pro](https://github.com/jlgarridol/Mailspring-pro) | Mailspring-pro variant | - |

## Discovering More Plugins

- [GitHub Topic: mailspring-plugin](https://github.com/topics/mailspring-plugin) - All plugins tagged with this topic

## Creating Your Own Plugin

To create your own plugin, see:
- [Postra-Plugin-Starter](https://github.com/fcools/postra-mail-Plugin-Starter) - Official template
- [Creating Composer Plugins](./creating-composer-plugins.md) - Guide in this repo
- Built-in plugins in `app/internal_packages/` for reference (e.g., `composer-templates`, `phishing-detection`)

### Plugin Installation

Plugins should be copied or symlinked to:
- **macOS**: `~/Library/Application Support/Postra/packages/`
- **Linux**: `~/.config/Postra/packages/`
- **Windows**: `%APPDATA%/Postra/packages/`

You can find this directory by going to **Developer > Show Mailsync Logs** in Postra.
