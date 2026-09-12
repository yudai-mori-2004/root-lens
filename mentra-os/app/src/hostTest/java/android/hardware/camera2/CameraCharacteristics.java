package android.hardware.camera2;
import android.util.Range;
public class CameraCharacteristics {
    public static class Key<T>{
    }
    public static final Key<Range<Float>> CONTROL_ZOOM_RATIO_RANGE=new Key<>();
    public static final Key<int[]> LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION=new Key<>();
    public <T>T get(Key<T> k){
        return null;
    }
}
