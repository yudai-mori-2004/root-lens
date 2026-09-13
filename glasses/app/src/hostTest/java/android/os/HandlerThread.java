package android.os;
public class HandlerThread extends Thread {
    public HandlerThread(String s){
        super(s);
    }
    public synchronized void start(){
    }
    public Looper getLooper(){
        return new Looper();
    }
    public boolean quitSafely(){
        return true;
    }
}
