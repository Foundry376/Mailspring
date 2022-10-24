import * as React from 'react';
import cheerio from 'cheerio';
import { Message, ComponentRegistry } from 'mailspring-exports';
import { UnsubscribeHeader } from './unsubscribe-header';

const regexps = [
  // English
  /unsubscribe/gi,
  /unfollow/gi,
  /opt[ -]{0,2}out/gi,
  /email preferences/gi,
  /subscription/gi,
  /notification settings/gi,
  /Remove yourself from this mailing/gi,
  // Danish
  /afmeld/gi,
  /afmelden/gi,
  /af te melden voor/gi,
  // Spanish
  /darse de baja/gi,
  // French
  /désabonnement/gi,
  /désinscrire/gi,
  /désinscription/gi,
  /désabonner/gi,
  /préférences d'email/gi,
  /préférences d'abonnement/gi,
  // Russian - this is probably wrong:
  /отказаться от подписки/gi,
  // Serbian
  /одјавити/gi,
  // Icelandic
  /afskrá/gi,
  // Hebrew
  /לבטל את המנוי/gi,
  // Creole (Haitian)
  /koupe abònman/gi,
  // Chinese (Simplified)
  /退订/gi,
  // Chinese (Traditional)
  /退訂/gi,
  // Arabic
  /إلغاء الاشتراك/gi,
  // Armenian
  /պետք է նախ միանալ/gi,
  // German
  /abbestellen/gi,
  /abbestellung/gi,
  /abmelden/gi,
  /abmeldung/gi,
  /ausschreiben/gi,
  /austragen/gi,
  // Swedish
  /avprenumerera/gi,
  /avregistrera/gi,
  /prenumeration/gi,
  /notisinställningar/gi,
];

const _throwawayCache: Record<string, string> = {};

interface UnsubscribeAction {
  href: string;
  innerText: string;
}

function bestUnsubscribeLink(message: Message): string {
  if (_throwawayCache[message.id] !== undefined) {
    return _throwawayCache[message.id];
  }

  let result = null;

  // Only check the body if it has been downloaded already
  if (message.body) {
    const dom = cheerio.load(message.body);
    const links = _getLinks(dom);

    for (const link of links) {
      for (const re of regexps) {
        if (re.test(link.href)) {
          // If the URL contains e.g. "unsubscribe" we assume that we have correctly
          // detected the unsubscribe link.

          _throwawayCache[message.id] = link.href;

          return link.href;
        }
        if (re.test(link.innerText)) {
          // If the URL does not contain "unsubscribe", but the text around the link contains
          // it, it is a possible candidate, we we still check all other links for a better match
          result = link.href;
        }
      }
    }

    _throwawayCache[message.id] = result;
  }

  return result;
}

const UnsubscribeHeaderContainer: React.FunctionComponent<{ message: Message }> = ({ message }) => {
  const unsubscribeAction = bestUnsubscribeLink(message);

  return unsubscribeAction ? <UnsubscribeHeader unsubscribeAction={unsubscribeAction} /> : null;
};

UnsubscribeHeaderContainer.displayName = 'UnsubscribeContainer';

export function activate() {
  ComponentRegistry.register(UnsubscribeHeaderContainer, { role: 'message:BodyHeader' });
}

export function deactivate() {
  ComponentRegistry.unregister(UnsubscribeHeaderContainer);
}

// Takes a parsed DOM (through cheerio) and returns links paired with contextual text
// Good at catching cases such as:
//    "If you would like to unsubscrbe from our emails, please click here."
// Returns a list of links as {href, innerText} objects
function _getLinks($): UnsubscribeAction[] {
  const aParents = [];
  $('a:not(blockquote a)').each((_index, aTag) => {
    if (aTag && aTag.parent && !$(aParents).is(aTag.parent)) {
      aParents.unshift(aTag.parent);
    }
  });

  const links = [];
  $(aParents).each((_parentIndex, parent) => {
    let link = false;
    let leftoverText = '';
    $(parent.children).each((_childIndex, child) => {
      if ($(child).is($('a'))) {
        if (link !== false && leftoverText.length > 0) {
          links.push({
            href: link,
            innerText: leftoverText,
          });
          leftoverText = '';
        }
        link = $(child).attr('href');
      }
      const text = $(child).text();
      const re = /(.*[.!?](?:\s|$))/g;
      if (re.test(text)) {
        const splitup = text.split(re);
        for (let i = 0; i < splitup.length; i += 1) {
          if (splitup[i] !== '' && splitup[i] !== undefined) {
            if (link !== false) {
              const fullLine = leftoverText + splitup[i];
              links.push({
                href: link,
                innerText: fullLine,
              });
              link = false;
              leftoverText = '';
            } else {
              leftoverText += splitup[i];
            }
          }
        }
      } else {
        leftoverText += text;
      }
      leftoverText += ' ';
    });
    if (link !== false && leftoverText.length > 0) {
      links.push({
        href: link,
        innerText: leftoverText,
      });
    }
  });
  return links;
}
