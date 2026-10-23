import http from 'http';
import React from 'react';
import ReactDOM from 'react-dom';
import OAuthSignInPage from '../lib/oauth-signin-page';
import AccountProviders from '../lib/account-providers';

describe('OAuthSignInPage fallback', () => {
  let container: HTMLDivElement;
  let page: OAuthSignInPage;
  let onSelect: jasmine.Spy;

  beforeEach(() => {
    spyOn(http, 'createServer').andReturn({ listen() {}, close() {}, once() {} } as any);
    onSelect = jasmine.createSpy('onSelect');
    container = document.createElement('div');
    page = ReactDOM.render(
      <OAuthSignInPage
        providerAuthPageUrl="https://login.microsoftonline.com/authorize"
        providerConfig={AccountProviders.find((p) => p.provider === 'office365')}
        serviceName="Office 365"
        buildAccountFromAuthResponse={async () => null}
        onSuccess={() => {}}
        onTryAgain={() => {}}
        fallback={{ label: 'Sign in without Microsoft 365 sending', prompt: 'Asked?', onSelect }}
      />,
      container
    ) as any;
  });

  afterEach(() => ReactDOM.unmountComponentAtNode(container));

  it('is offered while sign-in is pending, since closing an approval tab sends no decline', () => {
    const link = container.querySelector('.alternative-auth a') as HTMLAnchorElement;
    expect(container.textContent).toContain('Asked?');
    expect(link.textContent).toEqual('Sign in without Microsoft 365 sending');
    link.click();
    expect(onSelect).toHaveBeenCalled();
  });

  it('moves beside Try Again once the provider declines', () => {
    page._onAuthorizationDeclined('AADSTS90094: An administrator must grant permission.');
    expect(container.querySelector('.alternative-auth a')).toBe(null);
    const buttons = Array.from(container.querySelectorAll('.btn')).map((b) => b.textContent);
    expect(buttons).toContain('Sign in without Microsoft 365 sending');
  });
});
