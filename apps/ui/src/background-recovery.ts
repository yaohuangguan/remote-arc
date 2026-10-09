export type RecoveryDeviceSnapshot = {
  id: string;
  status: string;
  background_enabled?: boolean | null;
  background_guard_active?: boolean | null;
};

export function recoveryConfirmed(device: RecoveryDeviceSnapshot | undefined, expectedEnabled: boolean): boolean {
  if (!device) return false;
  // A successful write is not necessarily an active local launchd/Run service.
  // A stop_current request can intentionally disconnect the execution owner.
  if (expectedEnabled) {
    return device.status === "online" && device.background_enabled === true && device.background_guard_active === true;
  }
  return device.background_enabled === false && device.background_guard_active !== true;
}

export async function waitForRecoveryState(
  deviceId: string,
  enabled: boolean,
  options: {
    read: () => Promise<RecoveryDeviceSnapshot[]>;
    pause: (milliseconds: number) => Promise<void>;
    attempts?: number;
    intervalMs?: number;
  },
): Promise<boolean> {
  const attempts = options.attempts ?? 12;
  for (let i = 0; i < attempts; i++) {
    try {
      const devices = await options.read();
      if (recoveryConfirmed(devices.find((device) => device.id === deviceId), enabled)) return true;
    } catch {
      // Offline transitions and short-term Relay errors do not imply success.
    }
    if (i + 1 < attempts) await options.pause(options.intervalMs ?? 1500);
  }
  return false;
}

/**
 * A stop acknowledgment is not a stopped Agent. Observe a fresh Relay
 * presence snapshot: missing, stale, or fetch errors do not prove shutdown.
 */
export async function waitForAgentOffline(
  deviceId: string,
  options: {
    read: () => Promise<RecoveryDeviceSnapshot[]>;
    pause: (milliseconds: number) => Promise<void>;
    attempts?: number;
    intervalMs?: number;
  },
): Promise<boolean> {
  const attempts = options.attempts ?? 12;
  for (let i = 0; i < attempts; i++) {
    try {
      const devices = await options.read();
      if (devices.find((device) => device.id === deviceId)?.status === "offline") return true;
    } catch {
      // A transient error or lost response is never a success signal.
    }
    if (i + 1 < attempts) await options.pause(options.intervalMs ?? 1200);
  }
  return false;
}
