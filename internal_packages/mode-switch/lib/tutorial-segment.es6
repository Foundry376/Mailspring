import {TutorialUtils} from 'nylas-exports';
const AbortablePromise = TutorialUtils.AbortablePromise;

const steps = [
  { windowType: 'default',
    perform: (render, clear) => {
      const messageOpen = document.querySelector("[data-tutorial-id='message-list']");
      let waitForMessageOpen;
      if (messageOpen) {
        // If an email is already open, proceed
        waitForMessageOpen = AbortablePromise((resolve) => { resolve(); }, () => {});
      } else {
        // Wait for user to open an email
        waitForMessageOpen = TutorialUtils.findElement('message-list')
        render(
          'thread-list',
          'Contact Context',
          "Let's check out some contact information! First, open an email.",
          {fromSide: true})
      }
      return waitForMessageOpen.then(() => {
        clear()
        return TutorialUtils.findElement('sidebar-toggle-button').then((sidebarToggle) => {
          // wait for the sidebar to be expanded (via click on toggle icon)
          // resolves immediately if it is already expanded
          let waitForExpand;
          let expanded = sidebarToggle.getAttribute('data-tutorial-state');
          expanded = expanded === 'true';
          if (expanded) {
            waitForExpand = new AbortablePromise((resolve) => resolve(), () => {});
          } else {
            waitForExpand = TutorialUtils.waitForClick(sidebarToggle);
            const instructions = "Now click this icon to expand our <b>Contextual Sidebar</b>";
            render('sidebar-toggle-button', 'Expand Contextual Sidebar', instructions);
          }

          // Once the sidebar is expanded, wait for user to click proceed button
          return waitForExpand.then(() => {
            clear();
            const waitForProceed = TutorialUtils.waitForClick('proceed')
            const instructions = "Great! This is our <b>Contextual Sidebar</b> with enriched contact profiles. These help you understand who you are emailing and makes it easy to see the message history you have with that person. <br/><br/><button class='btn' data-tutorial-id='proceed'>Got it!</button>"
            render('.column-MessageListSidebar', 'Compose with Context', instructions, {isGenericSelector: true, fromSide: true});
            return waitForProceed;
          });
        });
      })
    },
  },
];

export default steps;
