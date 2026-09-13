package io.rootlens.mentra;
import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
public class DeviceProbe {
    public static class Snapshot {
        public String cameraId="0";
        public CameraCharacteristics characteristics=new CameraCharacteristics();
    }
    public static Snapshot inspect(Context c){
        return new Snapshot();
    }
}
