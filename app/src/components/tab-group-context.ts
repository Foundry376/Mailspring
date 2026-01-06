import React from 'react';

/**
 * Interface for the TabGroup context value.
 * Provides focus management within a group of tabbable elements.
 */
export interface TabGroupContextType {
  /**
   * Shifts focus to the next (dir=1) or previous (dir=-1) tabbable element
   * within the tab group.
   */
  shiftFocus: (dir: number) => void;
}

/**
 * Context for managing tab focus within a group of elements.
 * Used by TabGroupRegion to provide focus navigation to child components.
 */
export const TabGroupContext = React.createContext<TabGroupContextType | null>(null);
