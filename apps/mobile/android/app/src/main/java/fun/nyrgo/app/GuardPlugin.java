package fun.nyrgo.app;

import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;

import java.util.HashMap;
import java.util.Map;

/**
 * nyrGo!'s native guard: GPS fixes that say whether Android considers them mocked (a location
 * spoofing app), and Play Integrity tokens that let the server check this is the genuine app on
 * a genuine device. The game's server decides what to do with both; nothing is judged here.
 */
@CapacitorPlugin(
    name = "Guard",
    permissions = {
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        )
    }
)
public class GuardPlugin extends Plugin {

    private LocationManager manager;
    private final Map<String, LocationListener> watches = new HashMap<>();

    @Override
    public void load() {
        manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
    }

    /** Starts sending fixes as "fix" events (kept call); answers with the watch id. */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void watchPosition(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterPermission");
            return;
        }
        startWatch(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            startWatch(call);
        } else {
            call.reject("denied", "DENIED");
        }
    }

    private void startWatch(PluginCall call) {
        if (manager == null) {
            call.reject("unsupported", "UNSUPPORTED");
            return;
        }
        call.setKeepAlive(true);
        final String id = call.getCallbackId();
        LocationListener listener = location -> call.resolve(toJson(location));
        watches.put(id, listener);
        try {
            boolean any = false;
            for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(provider, 2000L, 0f, listener, Looper.getMainLooper());
                    any = true;
                }
            }
            if (!any) call.reject("unavailable", "UNAVAILABLE");
        } catch (SecurityException e) {
            call.reject("denied", "DENIED");
        }
    }

    @PluginMethod
    public void clearWatch(PluginCall call) {
        String id = call.getString("id");
        LocationListener listener = id == null ? null : watches.remove(id);
        if (listener != null && manager != null) manager.removeUpdates(listener);
        if (id != null) {
            PluginCall kept = bridge.getSavedCall(id);
            if (kept != null) bridge.releaseCall(kept);
        }
        call.resolve();
    }

    private static JSObject toJson(Location l) {
        JSObject o = new JSObject();
        o.put("lat", l.getLatitude());
        o.put("lng", l.getLongitude());
        o.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : 9999);
        o.put("speed", l.hasSpeed() ? l.getSpeed() : null);
        o.put("timestamp", l.getTime());
        o.put("provider", l.getProvider());
        o.put("mock", isMock(l));
        return o;
    }

    @SuppressWarnings("deprecation")
    private static boolean isMock(Location l) {
        return Build.VERSION.SDK_INT >= 31 ? l.isMock() : l.isFromMockProvider();
    }

    /** A Play Integrity token bound to the server's nonce (base64url, 16+ bytes). */
    @PluginMethod
    public void integrityToken(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.length() < 16) {
            call.reject("a nonce from the server is required", "BAD_NONCE");
            return;
        }
        IntegrityManager integrity = IntegrityManagerFactory.create(getContext().getApplicationContext());
        IntegrityTokenRequest.Builder request = IntegrityTokenRequest.builder().setNonce(nonce);
        String project = call.getString("cloudProjectNumber");
        if (project != null && !project.isEmpty()) request.setCloudProjectNumber(Long.parseLong(project));
        integrity
            .requestIntegrityToken(request.build())
            .addOnSuccessListener(response -> {
                JSObject o = new JSObject();
                o.put("token", response.token());
                call.resolve(o);
            })
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "INTEGRITY_FAILED"));
    }
}
