package android.hardware.camera2;
import android.os.Handler;
public class CameraManager {
    public static CameraDevice.StateCallback callback;
    public void openCamera(String id,CameraDevice.StateCallback cb,Handler h)throws CameraAccessException{
        callback=cb;
    }
}
