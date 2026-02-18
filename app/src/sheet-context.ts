import React from 'react';

/**
 * Context for providing sheet depth information to child components.
 * Used by Sheet and SheetToolbar to communicate the current sheet's
 * depth in the workspace stack.
 */
export const SheetDepthContext = React.createContext<number>(0);
