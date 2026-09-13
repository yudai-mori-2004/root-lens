package io.rootlens.mentra;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final int CAPTURE_PERMISSION_REQUEST = 100;
    private static final String[] CAPTURE_PERMISSIONS = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(40, 40, 40, 40);

        TextView title = new TextView(this);
        title.setText(R.string.capture_title);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView transferInstructions = new TextView(this);
        transferInstructions.setText(R.string.usb_transfer_instructions);
        transferInstructions.setPadding(0, 24, 0, 24);
        root.addView(transferInstructions);

        Button probe = new Button(this);
        probe.setText(R.string.probe_hardware);
        probe.setOnClickListener(v -> send(AppContract.ACTION_PROBE));
        root.addView(probe);

        Button start = new Button(this);
        start.setText(R.string.start_short_capture);
        start.setOnClickListener(v -> startCapture(30));
        root.addView(start);

        Button startFiveHours = new Button(this);
        startFiveHours.setText(R.string.start_five_hour_capture);
        startFiveHours.setOnClickListener(v -> startCapture(AppContract.MAX_SESSION_SECONDS));
        root.addView(startFiveHours);

        Button stop = new Button(this);
        stop.setText(R.string.stop_capture);
        stop.setOnClickListener(v -> send(AppContract.ACTION_STOP));
        root.addView(stop);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);

        if (!hasCapturePermissions()) {
            requestPermissions(CAPTURE_PERMISSIONS, CAPTURE_PERMISSION_REQUEST);
        }
    }

    private boolean hasCapturePermissions() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private void send(String action) {
        Intent intent = new Intent(this, CaptureService.class);
        intent.setAction(action);
        startForegroundService(intent);
    }

    private void startCapture(int durationSeconds) {
        Intent intent = new Intent(this, CaptureService.class);
        intent.setAction(AppContract.ACTION_START);
        intent.putExtra(AppContract.EXTRA_DURATION_SECONDS, durationSeconds);
        startForegroundService(intent);
    }
}
