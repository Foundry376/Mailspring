import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

interface LocationVideoInputProps {
  value: string;                      // Current location value
  onChange: (value: string) => void;  // Callback when location changes
  onVideoToggle?: () => void;         // Optional callback for video button click
  showVideoButton?: boolean;          // Whether to show video button (default: true)
}

export const LocationVideoInput: React.FC<LocationVideoInputProps> = ({
  value,
  onChange,
  onVideoToggle,
  showVideoButton = true,
}) => {
  const handleVideoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onVideoToggle) {
      onVideoToggle();
    }
  };

  return (
    <div className="location-video-input">
      <input
        type="text"
        className="location-input"
        placeholder={localized('Add Location or Video Call')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {showVideoButton && (
        <div
          className="video-toggle"
          onClick={handleVideoClick}
          title={localized('Add Video Call')}
        >
          <RetinaImg
            name="ic-eventcard-videocall.png"
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </div>
      )}
    </div>
  );
};
