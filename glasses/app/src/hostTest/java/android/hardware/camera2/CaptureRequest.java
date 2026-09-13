package android.hardware.camera2;
import android.view.Surface;
public class CaptureRequest {
    public static final int CONTROL_CAPTURE_INTENT=1,CONTROL_CAPTURE_INTENT_VIDEO_RECORD=2,CONTROL_AE_MODE=3,CONTROL_AE_MODE_ON=4,CONTROL_AE_TARGET_FPS_RANGE=5,CONTROL_ZOOM_RATIO=6,CONTROL_VIDEO_STABILIZATION_MODE=7,CONTROL_VIDEO_STABILIZATION_MODE_OFF=8,FLASH_MODE=9,FLASH_MODE_OFF=10,LENS_OPTICAL_STABILIZATION_MODE=11,LENS_OPTICAL_STABILIZATION_MODE_OFF=12;
    public static class Builder {
        public void addTarget(Surface s){
        }
        public void set(int k,Object v){
        }
        public CaptureRequest build(){
            return new CaptureRequest();
        }
    }
}
