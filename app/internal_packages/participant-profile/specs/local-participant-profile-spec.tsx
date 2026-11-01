import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Contact } from 'mailspring-exports';
import SidebarParticipantProfile from '../lib/sidebar-participant-profile';

describe('Local participant profile', () => {
  it('shows the contact name and email without remote photo or enrichment resources', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <SidebarParticipantProfile
        contact={
          new Contact({
            name: 'Local Person',
            email: 'local@example.test',
          })
        }
      />
    );
    expect(html).toContain('Local Person');
    expect(html).toContain('local@example.test');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('Try it');
    expect(html).not.toContain('<img');
  });
});
