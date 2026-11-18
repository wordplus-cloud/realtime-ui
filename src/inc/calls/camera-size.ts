import { host } from "../../host.ts";

/**
 * The size and frame rate a call opens the camera at where the app says nothing (UiHost.cameraSize): 1080 lines at
 * 16:9 and 30 frames, as realtime-client's cameraCapture() gives them without a call's settings.
 */
export const CAMERA_CAPTURE = { width: 1920, height: 1080, frameRate: 30 } as const;

export interface CameraCapture {
    width: number,
    height: number,
    frameRate: number,
}

/**
 * What a camera is asked for, the call's size as the app opens it (UiHost.cameraSize): the SDK's calls and the device
 * settings' preview ask the same, so the preview shows the shape the others get. Ideals only, so a camera that cannot
 * give 1080 gives its nearest instead of failing. Asked for no size, Chrome opens 640x480, a 4:3 crop of a 16:9
 * camera.
 */
export function cameraConstraints(): MediaTrackConstraints {
    const given = host().cameraSize?.();
    const size = given && given.width > 0 && given.height > 0 ? given : CAMERA_CAPTURE;
    return { width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: size.frameRate || CAMERA_CAPTURE.frameRate } };
}
