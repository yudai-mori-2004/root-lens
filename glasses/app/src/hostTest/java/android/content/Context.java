package android.content;
import java.io.*;
public class Context {
    public static final String CAMERA_SERVICE="camera";
    public Context getApplicationContext(){
        return this;
    }
    public File getExternalFilesDir(String s){
        return new File(System.getProperty("harness.data"));
    }
    public Object getSystemService(String s){
        return new android.hardware.camera2.CameraManager();
    }
}
