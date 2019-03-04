import React from 'react';
declare global {
  namespace JSX {
    interface IntrinsicElements {
      font: React.DetailedHTMLProps<React.HTMLAttributes<HTMLFontElement>, HTMLFontElement> & {
        size?: any;
      };
      strike: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
    }
  }
}
