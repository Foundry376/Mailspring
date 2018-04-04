import crypto from 'crypto';
import URL from 'url';
import ReactDOMServer from 'react-dom/server';
import Templates from './templates';

export const RAW_TEMPLATE_NAME = 'raw';

export const DataShape = [
  {
    key: 'name',
    label: 'Name',
  },
  {
    key: 'title',
    label: 'Title',
  },
  {
    key: 'phone',
    label: 'Phone',
  },
  {
    key: 'email',
    label: 'Email Address',
  },
  {
    key: 'fax',
    label: 'Fax',
  },
  {
    key: 'address',
    label: 'Address',
  },
  {
    key: 'websiteURL',
    label: 'Website URL',
  },
  {
    key: 'facebookURL',
    label: 'Facebook URL',
  },
  {
    key: 'twitterHandle',
    label: 'Twitter Handle',
  },
  {
    key: 'tintColor',
    label: 'Theme Color',
    placeholder: 'ex: #419bf9, purple',
  },
];

export const ResolveSignatureData = data => {
  data = Object.assign({}, data);

  ['websiteURL', 'facebookURL'].forEach(key => {
    if (data[key] && !data[key].includes(':')) {
      data[key] = `http://${data[key]}`;
    }
  });

  // sanitize twitter handle
  if (data.twitterHandle) {
    if (data.twitterHandle.includes('/')) {
      // a url was likely entered, lets grab the user (last portion).
      const split = data.twitterHandle.split('/');
      data.twitterHandle = split[split.length - 1];
    }
    if (data.twitterHandle[0] === '@') {
      // an at symbol was added, lets remove it.
      data.twitterHandle = data.twitterHandle.slice(1);
    }
  }

  if (data.photoURL === 'gravatar') {
    const hash = crypto
      .createHash('md5')
      .update((data.email || '').toLowerCase().trim())
      .digest('hex');
    data.photoURL = `https://www.gravatar.com/avatar/${hash}/?s=160&msw=160&msh=160`;
  }

  if (data.photoURL === 'twitter') {
    data.photoURL = `https://twitter.com/${
      data.twitterHandle
    }/profile_image?size=original&msw=128&msh=128`;
  }

  if (data.photoURL === 'company') {
    const domain =
      (data.websiteURL && URL.parse(data.websiteURL).hostname) ||
      (data.email && data.email.split('@').pop());
    data.photoURL = `https://logo.clearbit.com/${domain}?msw=128&msh=128`;
  }

  if (data.photoURL === 'custom') {
    data.photoURL = '';
  }

  return data;
};

export function RenderSignatureData(data) {
  const template = Templates.find(t => t.name === data.templateName) || Templates[0];
  return ReactDOMServer.renderToStaticMarkup(template(ResolveSignatureData(data)));
}
