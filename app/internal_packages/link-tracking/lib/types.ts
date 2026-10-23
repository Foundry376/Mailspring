export interface LinkTrackingMetadata {
  uid: string;
  // Every recipient got the same tracked links (the account sends through Microsoft Graph),
  // so clicks carry no recipient.
  shared_body?: boolean;
  links: [
    {
      url: string;
      redirect_url: string;
    },
  ];
  click_data: {
    recipient: string;
    timestamp: number;
  }[];
}
