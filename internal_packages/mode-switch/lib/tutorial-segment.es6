import Rx from 'rx-lite';

const steps = [
  {
    windowType: 'default',
    run: ({setOverlay}) => {
      setOverlay({
        selector: ".column-ThreadList",
        title: 'Contact Context',
        instructions: "Let's check out some contact information! First, open an email.",
        fromSide: true,
      });
      return Rx.Observable.fromQuerySelector("[data-tutorial-id='message-list']")
    },
  },
  {
    windowType: 'default',
    run: ({setOverlay}) => {
      const toggleSelector = "[data-tutorial-id='sidebar-toggle-button']";
      return Rx.Observable.fromQuerySelector(toggleSelector).flatMapLatest((toggleEl) => {
        const expanded = toggleEl.getAttribute('data-tutorial-state') === 'true';

        if (expanded) {
          return Rx.Observable.of(null);
        }

        setOverlay({
          selector: toggleSelector,
          title: 'Expand Contextual Sidebar',
          instructions: "Now click this icon to expand our <b>Contextual Sidebar</b>",
        });

        return Rx.Observable.fromEvent(toggleEl, 'click');
      });
    },
  },
  {
    windowType: 'default',
    run: ({setOverlay}) => {
      setOverlay({
        selector: '.column-MessageListSidebar',
        title: 'Compose with Context',
        instructions: "Great! This is our <b>Contextual Sidebar</b> with enriched contact profiles. These help you understand who you are emailing and makes it easy to see the message history you have with that person. <br/><br/><button class='btn' data-tutorial-id='proceed'>Got it!</button>",
        fromSide: true,
      })
      const selector = "[data-tutorial-id='proceed']";
      return Rx.Observable.fromQuerySelector(selector).flatMapLatest((el) => {
        return Rx.Observable.fromEvent(el, 'click');
      });
    },
  },
];

export default steps;
