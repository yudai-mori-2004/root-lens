package android.hardware.camera2;
public class CaptureFailure {
    public final long n;
    public CaptureFailure(long n){
        this.n=n;
    }
    public long getFrameNumber(){
        return n;
    }
    public int getReason(){
        return 0;
    }
}
