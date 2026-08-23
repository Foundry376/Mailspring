import React from 'react';
import { localized } from 'mailspring-exports';
import { RetinaImg } from './retina-img';

interface CopyButtonProps {
  /* The text to place on the clipboard, or a function returning it. */
  text: string | (() => string);
  className?: string;
  title?: string;
  /* How long the checkmark is displayed after copying, in milliseconds. */
  duration?: number;
  onCopy?: () => void;
}

/*
Public: CopyButton is a small icon button that copies text to the clipboard and
briefly swaps its icon for a checkmark. The icon is rendered inside a fixed-size
box so the button never changes size, which would otherwise reflow the content
alongside it.

Section: Component Kit
*/
export default function CopyButton({
  text,
  className,
  title,
  duration = 2000,
  onCopy,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onClick = () => {
    navigator.clipboard
      .writeText(typeof text === 'function' ? text() : text)
      .catch((err) => console.error('Failed to copy to clipboard:', err));

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setCopied(false);
    }, duration);

    if (onCopy) onCopy();
  };

  return (
    <button
      className={`btn btn-small btn-icon copy-button ${className || ''}`}
      onClick={onClick}
      title={title || localized('Copy to clipboard')}
    >
      <span className="copy-button-icon">
        <RetinaImg
          name={copied ? 'tagging-checkmark.png' : 'icon-copytoclipboard.png'}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </span>
    </button>
  );
}
