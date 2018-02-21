## Roadmap:

The initial release of Mailspring was in Nov. 2017. The roadmap is largely based on popular GitHub issues, with an emphasis on the following:

### Near-term Focus

* **Sync Issues**

  Goal: Make it possible to connect and sync any IMAP account with Mailspring. The project is _close_ but still encounters sync issues with small or unsual IMAP providers.

* **Theme and Plugin Browser**

  Goal: Make it easier to download and install community themes and plugins from a trusted, centralized "gallery", like the Chrome Web Store. (No immediate plans to allow to enable paid plugins.)

* **Mail Merge**

  Goal: Make it possible to use a Template and a spreadsheet to batch-send emails with open / link tracking. Nylas Mail used to have this feature but the implementation confused users and didn't handle sending errors well.

* **Email Signing**

  Goal: Allow users to sign outgoing email with a certificate, and verify the signatures of signed inbound email.

* **Performance**

  Goal: Users shouldn't notice Mailspring is an Electron app. Need to improve typing / load performance of the composer and continue improving responsiveness of the thread list and message list.

### Long-term

* **Advanced Mail Rules**

  Goal: Create a new UI and revamp the mail rules engine to enable mail rules based on custom JavaScript code. Could enable really advanced workflows to be automated if we did it right!

* **Contact Management**

  Goal: Replace Mailspring's built in contacts list (which is based on email headers) with one that uses CardDav and syncs with Google Contacts / O365 Contacts and allows full contact CRUD.

* **Calendar**

  Goal: Build a beautiful CalDav and Google Calendar interface that can be opened in a new window or as a tab in the main window, making Mailspring a full replacement for the calendar-contacts-email suite.

## Why is Mailsync Closed Source?

For the initial release I've decided to keep the new C++ codebase closed-source. When you pull this repository and run `npm install`, the correct Mailsync build for your platform is automatically downloaded and put in place so you can hack away on the Mailspring Electron app. For those of you who are interested, here's why it's closed-source:

* **Open source is a commitment.** When I was the lead engineer of the Nylas Mail team at Nylas, I spent thousands of hours responding to GitHub issues, helping people build the source, and trying to give PR feedback that was actionable and kind. I'm expecting to spend about 30% of my time working with the open-source community on the JavaScript side of Mailspring, and I'd rather focus on improving existing documentation and hackability than expand code surface area past what I can support. Especially until it's past the ["bus factor"](https://en.wikipedia.org/wiki/Bus_factor) of one!

* **Mailsync is hard to compile.** Mailsync is written in C++0x and uses new features like `shared_ptr` and `condition_variable`. It requires GCC 4.8 and has a ton of dependencies and required build flags. If `node-sqlite3` is any indication, open-sourcing it in it's current form would be a GitHub Issues disaster. (Compared to mailsync, `node-sqlite3` is pretty easy to build but a whopping _35%_ of it's open issues are [compilation-related!](https://github.com/mapbox/node-sqlite3/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20compile) 😰).

* **The odds of great PRs are low.** Mailsync is a multithreaded, cross-platform C++ application that interfaces with old, fragile protocols that have their own learning curves and are difficult to mock. For folks to contribute meaningful pull requests, I'd have to write great docs and tests. I'd also need to spend a /lot/ of time reviewing changes for side-effects, enforcing good C++ techniques, and checking changes for performance impact. Maybe I'll be able to support this in the future, but not yet!

If you're interested in contributing to the Mailspring Mailsync codebase and have some time and skill to throw at it, please let me know!
