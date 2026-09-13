import { arkitCaptureMethod } from './arkit';
import { iphoneCaptureMethod } from './iphone';

export type {
  RecordingSession,
  OutputFileSpec,
  HandLandmark,
  WearerHandObservation,
  GestureKind,
  HandTrackEvent,
  DisplayOrientation,
  HandTrackSubscription,
  CaptureMethod,
  CaptureMethodId,
} from './types';

export const CAPTURE_METHODS = [arkitCaptureMethod, iphoneCaptureMethod] as const;
export const DEFAULT_CAPTURE_METHOD = arkitCaptureMethod;

export function getCaptureMethod(id: string) {
  return CAPTURE_METHODS.find((method) => method.id === id);
}
