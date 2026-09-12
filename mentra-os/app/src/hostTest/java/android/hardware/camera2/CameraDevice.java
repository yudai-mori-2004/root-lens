package android.hardware.camera2;
import android.view.Surface;
import android.os.Handler;
import java.util.List;
public class CameraDevice {
    public static final int TEMPLATE_RECORD=3;
    public RuntimeException createFailure;
    public boolean closed;
    public CameraCaptureSession.StateCallback sessionCallback;
    public void createCaptureSession(List<Surface> s,CameraCaptureSession.StateCallback cb,Handler h)throws CameraAccessException {
        if(createFailure!=null)throw createFailure;
        sessionCallback=cb;
    }
    public CaptureRequest.Builder createCaptureRequest(int t)throws CameraAccessException{
        return new CaptureRequest.Builder();
    }
    public void close(){
        closed=true;
    }
    public static abstract class StateCallback {
        public abstract void onOpened(CameraDevice d);
        public abstract void onDisconnected(CameraDevice d);
        public abstract void onError(CameraDevice d,int e);
    }
}
