package android.hardware.camera2;
import android.os.Handler;
public class CameraCaptureSession {
    public CaptureCallback captureCallback;
    public boolean closed;
    public void close(){
        closed=true;
    }
    public void stopRepeating()throws CameraAccessException{
    }
    public void abortCaptures()throws CameraAccessException{
    }
    public int setRepeatingRequest(CaptureRequest r,CaptureCallback cb,Handler h)throws CameraAccessException{
        captureCallback=cb;
        return 1;
    }
    public static abstract class StateCallback {
        public abstract void onConfigured(CameraCaptureSession s);
        public abstract void onConfigureFailed(CameraCaptureSession s);
    }
    public static abstract class CaptureCallback {
        public void onCaptureStarted(CameraCaptureSession s,CaptureRequest r,long t,long n){
        }
        public void onCaptureCompleted(CameraCaptureSession s,CaptureRequest r,TotalCaptureResult res){
        }
        public void onCaptureFailed(CameraCaptureSession s,CaptureRequest r,CaptureFailure f){
        }
    }
}
