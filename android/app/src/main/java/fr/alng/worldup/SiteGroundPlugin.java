package fr.alng.worldup;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The site tells the app its ground at the top of the screen
 * (src/lib/app-system-bars.ts), which the status and navigation bars then
 * take (MainActivity.setSiteGround). An app without this plugin keeps bars of
 * the phone's theme: the site ignores the refusal.
 */
@CapacitorPlugin(name = "SiteGround")
public class SiteGroundPlugin extends Plugin {

    /** { color: "#rrggbb" } */
    @PluginMethod
    public void set(PluginCall call) {
        String color = call.getString("color", "");
        if (!color.matches("#[0-9a-fA-F]{6}")) {
            call.reject("Expected a #rrggbb color");
            return;
        }
        int parsed = Color.parseColor(color);
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setSiteGround(parsed);
            call.resolve();
        });
    }
}
