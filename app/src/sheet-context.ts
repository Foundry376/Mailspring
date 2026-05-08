import React from 'react';

// Provides the depth of the current sheet to descendants (e.g. the toolbar
// category picker, which only opens its popover when it lives in the top sheet).
// The default value matches the depth of the root sheet.
export const SheetDepthContext = React.createContext<number>(0);
