export interface OpenTrackingMetadata {
  uid: string;
  // Every recipient got the same tracking pixel (the account sends through Microsoft Graph),
  // so opens carry no recipient.
  shared_body?: boolean;
  open_data: [
    {
      timestamp: number;
      recipient: string;
    },
  ];
}
