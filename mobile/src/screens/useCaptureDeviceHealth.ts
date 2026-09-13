import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import {
  getArkitPowerState,
  getArkitThermalState,
  setArkitKeepAwake,
  setArkitScreenDimmed,
  subscribeThermalState,
  type PowerState,
  type ThermalState,
} from '../native/arkitCapture';

const DIM_AFTER_MS = 15_000;
const REDIM_AFTER_TAP_MS = 8_000;
const LOW_DISK_WARN_BYTES = 12 * 1024 ** 3;
const LOW_DISK_STOP_BYTES = 2 * 1024 ** 3;
const LOW_BATTERY_WARN_LEVEL = 0.35;
const LOW_BATTERY_STOP_LEVEL = 0.10;
const RESOURCE_POLL_MS = 30_000;

export type DeviceStopReason = 'thermal' | 'disk' | 'battery';

function reportDeviceHealthError(operation: string, error: unknown): void {
  console.warn(`[useCaptureDeviceHealth] ${operation} failed:`, error);
}

export function useCaptureDeviceHealth({
  recordingActive,
  pauseActive,
  recordingStartedAt,
  onThermalState,
}: {
  recordingActive: boolean;
  pauseActive: boolean;
  recordingStartedAt: () => number;
  onThermalState: (state: ThermalState) => void;
}) {
  const thermalRef = useRef<ThermalState>('nominal');
  const freeDiskRef = useRef<number | null>(null);
  const powerRef = useRef<PowerState | null>(null);
  const wakeUntilRef = useRef(0);
  const onThermalStateRef = useRef(onThermalState);
  const recordingStartedAtRef = useRef(recordingStartedAt);
  const [dimmed, setDimmed] = useState(false);

  onThermalStateRef.current = onThermalState;
  recordingStartedAtRef.current = recordingStartedAt;

  useEffect(() => {
    getArkitThermalState()
      .then((state) => { thermalRef.current = state; })
      .catch((error) => reportDeviceHealthError('read thermal state', error));
    getArkitPowerState()
      .then((power) => { powerRef.current = power; })
      .catch((error) => reportDeviceHealthError('read power state', error));
    FileSystem.getFreeDiskStorageAsync()
      .then((bytes) => { freeDiskRef.current = bytes; })
      .catch((error) => reportDeviceHealthError('read free disk space', error));
    const subscription = subscribeThermalState(({ state }) => {
      thermalRef.current = state;
      onThermalStateRef.current(state);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!recordingActive) return;
    let cancelled = false;
    const poll = () => {
      FileSystem.getFreeDiskStorageAsync()
        .then((bytes) => { if (!cancelled) freeDiskRef.current = bytes; })
        .catch((error) => reportDeviceHealthError('refresh free disk space', error));
      getArkitPowerState()
        .then((power) => { if (!cancelled) powerRef.current = power; })
        .catch((error) => reportDeviceHealthError('refresh power state', error));
    };
    poll();
    const interval = setInterval(poll, RESOURCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [recordingActive]);

  useEffect(() => {
    if (!recordingActive && !pauseActive) {
      setDimmed(false);
      wakeUntilRef.current = 0;
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      if (now < wakeUntilRef.current) {
        setDimmed(false);
      } else if (pauseActive) {
        setDimmed(true);
      } else {
        const startedAt = recordingStartedAtRef.current();
        if (startedAt > 0 && now - startedAt >= DIM_AFTER_MS) setDimmed(true);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [pauseActive, recordingActive]);

  useEffect(() => {
    setArkitScreenDimmed(dimmed)
      .catch((error) => reportDeviceHealthError('set screen dim state', error));
  }, [dimmed]);

  useEffect(() => {
    setArkitKeepAwake(true)
      .catch((error) => reportDeviceHealthError('enable keep-awake', error));
    return () => {
      setArkitKeepAwake(false)
        .catch((error) => reportDeviceHealthError('disable keep-awake', error));
      setArkitScreenDimmed(false)
        .catch((error) => reportDeviceHealthError('restore screen brightness', error));
    };
  }, []);

  const wake = useCallback(() => {
    wakeUntilRef.current = Date.now() + REDIM_AFTER_TAP_MS;
    setDimmed(false);
  }, []);

  const startWarnings = useCallback(() => {
    const power = powerRef.current;
    return {
      lowDisk: freeDiskRef.current !== null && freeDiskRef.current < LOW_DISK_WARN_BYTES,
      lowBattery:
        power !== null
        && power.level >= 0
        && !power.charging
        && power.level < LOW_BATTERY_WARN_LEVEL,
    };
  }, []);

  const stopReason = useCallback((): DeviceStopReason | null => {
    if (thermalRef.current === 'critical') return 'thermal';
    if (freeDiskRef.current !== null && freeDiskRef.current < LOW_DISK_STOP_BYTES) return 'disk';
    const power = powerRef.current;
    if (
      power !== null
      && power.level >= 0
      && !power.charging
      && power.level <= LOW_BATTERY_STOP_LEVEL
    ) return 'battery';
    return null;
  }, []);

  return { dimmed, wake, startWarnings, stopReason };
}
