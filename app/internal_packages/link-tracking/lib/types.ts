export interface LinkTrackingMetadata {
  uid: string;
  links: [
    {
      url: string;
      redirect_url: string;
    }
  ];
  click_data: {
    recipient: string;
    timestamp: number;
  }[];
}
