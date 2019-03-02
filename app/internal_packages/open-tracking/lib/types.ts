export interface OpenTrackingMetadata {
  uid: string;
  open_data: [
    {
      timestamp: number;
      recipient: string;
    }
  ];
}
export interface LinkTrackingMetadata {
  uid: string;
  click_data: [
    {
      timestamp: number;
      recipient: string;
    }
  ];
}
