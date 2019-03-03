export interface OpenTrackingMetadata {
  uid: string;
  open_data: [
    {
      timestamp: number;
      recipient: string;
    }
  ];
}
