package io.rootlens.mentra;
import java.io.*;
class SessionArtifacts {
    File directory,partialImu,partialVideo;
    int failCount;
    int discardCount;
    IOException discardFailure;
    boolean finalizedStarted;
    static SessionArtifacts create(File root)throws IOException{
        SessionArtifacts a=new SessionArtifacts();
        a.directory=new File(root,"synthetic");
        a.directory.mkdirs();
        a.partialImu=new File(a.directory,"imu.jsonl.partial");
        a.partialVideo=new File(a.directory,"rgb.mp4.partial");
        return a;
    }
    static SessionArtifacts createCalibration(File root)throws IOException{
        return create(root);
    }
    static class FrameRecord {
        long frameNumber,sensorTimestampNs,captureStartedTimestampNs,callbackElapsedRealtimeNs,callbackMonotonicNs;
        Long exposureTimeNs,frameDurationNs,rollingShutterSkewNs;
        int sensitivityIso;
    }
    void addCameraFrame(FrameRecord f)throws IOException{
    }
    static void writeText(File f,String s)throws IOException{
    }
    File finalizeClip(DeviceProbe.Snapshot p,RawImuRecorder i,long dur,int bitrate,long startWall,long startElapsed,long startMono,long stopWall,boolean started,VideoImuCalibration c,boolean audio)throws IOException {
        finalizedStarted=started;
        if(!started)throw new IOException("MediaRecorder did not produce a complete MP4");
        return directory;
    }
    void discardCancelled()throws IOException{
        if(discardFailure!=null)throw discardFailure;
        discardCount++;
    }
    void discardScratchIndexes(){
    }
    void failClip(Throwable t){
        failCount++;
    }
    void close()throws IOException{
    }
}
