import { useEffect, useState } from "react";

export const useDelayValue = <T>(value: T, delay: number): T => {
  const [delayedValue, setDelayedValue] = useState<T>(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDelayedValue(value);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value]);

  return delayedValue;
};
