package io.rootlens.mentra;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class CaptureCommandReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent command) {
        String action = command.getAction();
        Class<?> serviceClass;
        long reservation = 0L;
        if (AppContract.ACTION_CALIBRATE.equals(action)) {
            reservation = DeviceOperationGate.reserve(DeviceOperationGate.Owner.CALIBRATION);
            if (reservation == 0L) {
                CaptureFeedback.failed(context);
                return;
            }
            serviceClass = CalibrationService.class;
        } else if (AppContract.ACTION_TOGGLE.equals(action)
                && DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CALIBRATION)) {
            command.setAction(AppContract.ACTION_CANCEL_CALIBRATION);
            serviceClass = CalibrationService.class;
        } else if (AppContract.ACTION_START.equals(action)
                || AppContract.ACTION_STOP.equals(action)
                || AppContract.ACTION_TOGGLE.equals(action)
                || AppContract.ACTION_PROBE.equals(action)
                || AppContract.ACTION_STATUS.equals(action)) {
            serviceClass = CaptureService.class;
        } else {
            return;
        }
        Intent service = new Intent(context, serviceClass);
        service.setAction(command.getAction());
        service.putExtras(command);
        if (reservation != 0L) {
            service.putExtra(AppContract.EXTRA_OPERATION_TOKEN, reservation);
        }
        try {
            context.startForegroundService(service);
        } catch (RuntimeException error) {
            DeviceOperationGate.releaseReservation(reservation);
            CaptureFeedback.failed(context);
        }
    }
}
