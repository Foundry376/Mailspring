import { useEffect, useState } from 'react';

// Re-renders the component whenever the given config key changes.
export function useConfigValue<T = any>(keyPath: string): T {
  const [value, setValue] = useState<T>(() => AppEnv.config.get(keyPath));
  useEffect(() => {
    const sub = AppEnv.config.onDidChange(keyPath, () => setValue(AppEnv.config.get(keyPath)));
    return () => sub.dispose();
  }, [keyPath]);
  return value;
}
