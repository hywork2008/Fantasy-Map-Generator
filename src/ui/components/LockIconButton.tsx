import type React from "react";
import { useEffect, useState } from "react";
import { lock, stored, unlock } from "../../utils/domUtils";
import { IconButton } from "./IconButton";

interface LockIconButtonProps {
  /** The setting ID to lock, e.g., "points" or "temperatureEquator" */
  id: string;
}

export const LockIconButton: React.FC<LockIconButtonProps> = ({ id }) => {
  const [isLocked, setIsLocked] = useState(() => stored(id) !== null);

  useEffect(() => {
    const handler = (e: CustomEvent<{ id: string; locked: boolean }>) => {
      if (e.detail.id === id) {
        setIsLocked(e.detail.locked);
      }
    };
    document.addEventListener("fmg:lock-changed", handler as EventListener);
    return () => document.removeEventListener("fmg:lock-changed", handler as EventListener);
  }, [id]);

  const handleToggle = () => {
    if (isLocked) {
      unlock(id);
    } else {
      lock(id);
    }
  };

  return (
    <IconButton
      id={`lock_${id}`}
      data-locked={isLocked ? "1" : "0"}
      icon={isLocked ? "icon-lock" : "icon-lock-open"}
      onClick={handleToggle}
      tooltip={`Click to ${isLocked ? "unlock" : "lock"} this setting`}
    />
  );
};
