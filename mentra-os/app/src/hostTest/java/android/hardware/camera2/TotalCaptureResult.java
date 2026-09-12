package android.hardware.camera2;
public class TotalCaptureResult {
    public long number, timestamp;
    public static class Key<T>{
    }
    public static final Key<Long> SENSOR_TIMESTAMP=new Key<>(),SENSOR_EXPOSURE_TIME=new Key<>(),SENSOR_FRAME_DURATION=new Key<>(),SENSOR_ROLLING_SHUTTER_SKEW=new Key<>();
    public static final Key<Integer> SENSOR_SENSITIVITY=new Key<>();
    @SuppressWarnings("unchecked")
    public <T>T get(Key<T> k){
        if(k==SENSOR_TIMESTAMP)return (T)Long.valueOf(timestamp);
        return null;
    }
    public long getFrameNumber(){
        return number;
    }
}
