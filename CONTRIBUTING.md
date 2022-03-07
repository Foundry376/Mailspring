# Contributing to Mailspring

Thanks for checking out Mailspring! We'd love for you to contribute. Whether
you're a first-time open source contributor or an experienced developer, there
are ways you can help make Mailspring great!

## Contributing Code

One of the best ways is to grab a
[bug report](https://community.getmailspring.com/c/bugs/10),
[sync issue](https://community.getmailspring.com/c/sync/22),
or [feature suggestion](https://community.getmailspring.com/c/features/12)
that has been marked `accepted` and dig in. You can especially look for issues
marked as `help-wanted` or `low-hanging-fruit`.

Please be wary of working on issues *not* marked as `accepted`. Just because
someone has created an issue doesn't mean we'll accept a pull request for it.
See [Where to Contribute](#where-to-contribute) below for more information.

You can also help implement *any* feature by creating a **plugin** for it!
If you need inspiration, you can dig through the list of
[feature suggestions](https://community.getmailspring.com/c/features/12),
especially looking for anything marked `for-plugin`.

### Pull requests

The first time you submit a pull request, a bot will ask you to sign a
standard, bare-bones Contributor License Agreement. The CLA states that you
waive any patent or copyright claims you might have to the code you're
contributing. (For example, you can't submit a PR and then sue Mailspring
for using your code.)

## Triaging Issues

Another way to help is to [answer questions](https://community.getmailspring.com/c/help/7),
or to triage [bug reports](https://community.getmailspring.com/c/bugs/10) and
[sync issues](https://community.getmailspring.com/c/sync/22). If you're good at
testing and addressing issues, we'd love your help!

## Filing Issues

If you have a bug to report or a feature to suggest, you may do so on our
[Discourse](https://community.getmailspring.com/). Please carefully follow all
instructions in the template for the given type of issue you're reporting.

We also ask that you search for existing issues, *including closed ones!*
We're in the process of migrating. If someone has already reported a bug or
requested the feature you have in mind,  **vote for it** at the top.
Higher voted issues are more likely to be addressed.

For bugs, please verify that you're running the latest version of Mailspring.
If you file an issue without providing detail, we may close it without comment.

**Under no circumstances should you report an issue via GitHub. The GitHub
Issues feature is exclusively for Mailspring contributors to track tasks
which have been diagnosed, accepted, and scheduled on the roadmap.**

# Build and Run From Source

If you want to understand how Mailspring works or want to debug an issue,
you'll want to get the source, build it, and run it locally.

## Installing Prerequisites

You'll need git and a recent version of Node.JS (currently v16.X is recommended
with npm v8.1.2+). [nvm](https://github.com/creationix/nvm) is also highly
recommended. Based on your platform, you'll also need:

**Windows:**

- `npm install --global --production windows-build-tools`

**OS X:**

- Python
- Xcode and the Command Line Tools (Xcode -> Preferences -> Downloads), which
  will install `gcc` and the related toolchain containing `make`.

**Linux:**

- Python v2.7
- make
- A proper C/C++11 compiler tool chain, for example GCC
- Library dependencies:
  - On Debian-based Linux: `sudo apt-get install libx11-dev libxkbfile-dev execstack libgconf-2-4 libsecret-1-dev`
  - On Red Hat-based Linux: `sudo yum install libX11-devel.x86_64 libxkbfile-devel.x86_64 libsecret-1-dev libsecret-devel`.

After you have these tools installed, run the following commands to check out
Mailspring,install dependencies, and launch the app:

```
git clone https://github.com/foundry376/mailspring
cd mailspring
npm install
npm start
```

## Development Workflow

### App Data

When you're running Mailspring with `npm start`, it runs with the `--dev` flag
and user data is located in a `Mailspring-dev` folder alongside the regular
settings folder:

- Mac: `~/Library/Application Support/Mailspring-dev`
- Windows: `C:\Users\<you>\AppData\Roaming\Mailspring-dev`
- Linux: `~/.config/Mailspring-dev/`

### Developer Tools

From Mailspring, you can open the Developer Tools from the
menu: `Menu > Developer > Toggle Developer Tools`. Here are a few tips for
getting started:

- Errors and warnings will show in the console.

- On the console, `$m` is a shorthand for `mailspring-exports`, and allows you
  to access global `Stores` and `Model` classes.

- You don't need to stop and restart the development version of Mailspring
  after each change. You can just reload the window via `CTRL+R` (Windows/Linux)
  or `CMD+R` (macOS).

### Linting

We use `prettier` and `eslint` for linting our sources. You can run both of
these by running `npm run lint` on the command line. Always do this before
submitting a pull request to ensure the CI servers accept your code.

### Documentation

Back in 2015 and 2016, the Nylas Mail team made a huge effort to document
the codebase. The docs are still
[available on GitHub pages](https://foundry376.github.io/Mailspring/), and are
still largely relevant to Mailspring development.

### Testing Localization

You can run the app in different localizations by passing a langauge code to
Electron via `--lang=de`. To use this in conjunction `npm start`, you'll need
to use the `--` argument forwarding syntax: `npm start -- --lang=de`.

# Where to Contribute

Check out our [Discourse](https://community.getmailspring.com/) for all
potential areas for contributions. Note that just because a topic exists does
not mean we will accept a contribution to the core mail client for it. There
are several reasons we may not accepts a pull requests, like:

- **Maintainability** - We're _extremely_ wary of adding options and preferences
  for niche behaviors. Email is a wild west, and we can't afford to support
  every possible configuration. Our general rule is that the code complexity
  of adding a preference isn't worth it unless the user base is fairly evenly
  divided about the desired behavior.
  [We don't want to end up with this!](https://cloud.githubusercontent.com/assets/1037212/14989123/2a74e810-110b-11e6-8b5d-6f343bca712f.png)

- **User experience** - We want to deliver a lightweight and smooth mail
  client, so UX and performance matter a lot. If you'd like to change or
  extend the UI, consider doing it in a plugin or theme.

- **Architectural** - The team and/or feature owner needs to agree with any
  architectural impact a change may make. Things like new extension APIs must
  be discussed with and agreed upon by the feature owner. To improve the
  chances to get a pull request merged you should select an issue that is
  labelled with the help-wanted or bug labels.

In short, if the issue you want to work on is not labelled with `accepted`, you
can start a conversation on the Discourse topic about whether an external
contribution will be considered.

# Code of Conduct

In order to keep the conversation clear and transparent, please limit
discussion to English and keep things on topic with the issue. Be considerate
to others and try to be courteous and professional at all times.

Please note that this project is released with a Contributor Code of Conduct.
By participating in this project you agree to abide by its terms.

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](code_of_conduct.md)
