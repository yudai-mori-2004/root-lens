package android.media;
import java.io.*;
import android.view.Surface;
public class MediaRecorder {
    public static MediaRecorder latest;
    public OnErrorListener errorListener;
    public OnInfoListener infoListener;
    public boolean started,released;
    public boolean constructedOnHandler;
    public RuntimeException surfaceFailure, stopFailure, releaseFailure;
    public MediaRecorder(){
        latest=this;
        constructedOnHandler=android.os.Handler.dispatching;
    }
    public static class AudioSource{
        public static final int MIC=1;
    }
    public static class VideoSource{
        public static final int SURFACE=1;
    }
    public static class OutputFormat{
        public static final int MPEG_4=1;
    }
    public static class AudioEncoder{
        public static final int AAC=1;
    }
    public static class VideoEncoder{
        public static final int H264=1;
    }
    public interface OnErrorListener{
        void onError(MediaRecorder r,int what,int extra);
    }
    public interface OnInfoListener{
        void onInfo(MediaRecorder r,int what,int extra);
    }
    public void setOnErrorListener(OnErrorListener l){
        errorListener=l;
    }
    public void setOnInfoListener(OnInfoListener l){
        infoListener=l;
    }
    public void emitError(int what,int extra){
        if(errorListener!=null)errorListener.onError(this,what,extra);
    }
    public void setAudioSource(int x){
    }
    public void setVideoSource(int x){
    }
    public void setOutputFormat(int x){
    }
    public void setAudioEncoder(int x){
    }
    public void setAudioSamplingRate(int x){
    }
    public void setAudioChannels(int x){
    }
    public void setAudioEncodingBitRate(int x){
    }
    public void setVideoEncoder(int x){
    }
    public void setVideoEncodingBitRate(int x){
    }
    public void setVideoFrameRate(int x){
    }
    public void setVideoSize(int x,int y){
    }
    public void setOrientationHint(int x){
    }
    public void setOutputFile(String x){
    }
    public void prepare()throws IOException{
    }
    public Surface getSurface(){
        if(surfaceFailure!=null) throw surfaceFailure;
        return new Surface();
    }
    public void start(){
        started=true;
    }
    public void stop(){
        if(stopFailure!=null) throw stopFailure;
        started=false;
    }
    public void reset(){
    }
    public void release(){
        released=true;
        if(releaseFailure!=null) throw releaseFailure;
    }
}
