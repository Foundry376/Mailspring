// Replaces real names, addresses and subjects in the rendered DOM with fictional ones.
// Copy this file, edit the map for the data in your dev mailbox, and pass its contents as the
// setup-js argument to shoot.mjs (or run it via eval.mjs) after the view has loaded.
(() => {
  const map = [
    [/dstrekkie@gmail\.com/g, 'sam.rivera@example.com'],
    [/Dave Smith|\bDave\b/g, 'Sam Rivera'],
    [/joyceyuan80@gmail\.com/g, 'priya@northwind.example'],
    [/joyce yuan|Joyce Yuan/g, 'Priya Patel'],
    [/ben@foundry376\.com/g, 'alex.chen@contoso.example'],
    [/^ben$/g, 'Alex Chen'],
    [/bengotow@gmail\.com/g, 'you@gmail.com'],
    [/ben@foundry376\.on\S*/g, 'you@yourcompany.com'],
    [/Re: Missed you today/g, 'Proposal for Q4 partnership'],
    [/Re: Success! \(sort of\)/g, 'Following up on our call'],
    [/Alert - Ben \+ Joe 1:1 Lunch/g, 'Pricing sheet attached'],
    [/Re: Danny Go!/g, 'Intro: Northwind and Mailspring'],
    [/Re: Stymied!/g, 'Contract draft for review'],
    [/Re: Flaw in your execution engine/g, 'Onboarding next steps'],
    [/Re: Ideas from today’s meeting/g, 'Notes from our kickoff'],
    [/Re: Book chapter \(first draft\) is ready!/g, 'Case study draft'],
    [/https:\/\/foundry376\.com\/pricing/g, 'https://example.com/pricing'],
    [/https:\/\/github\.com\/Foundry376\/Mailspring/g, 'https://example.com/case-study'],
    [/https:\/\/calendly\.com\/bengotow\/30min/g, 'https://example.com/book-a-demo'],
  ];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let text = node.nodeValue;
    for (const [re, to] of map) text = text.replace(re, to);
    if (text !== node.nodeValue) node.nodeValue = text;
  }
  for (const el of document.querySelectorAll('[title]')) {
    let t = el.getAttribute('title');
    for (const [re, to] of map) t = t.replace(re, to);
    el.setAttribute('title', t);
  }
  return nodes.length;
})();
