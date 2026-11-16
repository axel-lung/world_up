package fr.alng.worldup;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The app's one screen: Capacitor's WebView, which shows the site
 * (capacitor.config.ts). On top of Capacitor, it opens the site's links that
 * come from elsewhere, keeps the site's own error pages, handles the back
 * button, and creates the channel the notifications show in.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new SiteWebViewClient(bridge));
        createNotificationChannel();
        // Back: the previous page, or, from the first one, the app goes to the background
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WebView webView = bridge.getWebView();
                    if (webView.canGoBack()) webView.goBack();
                    else moveTaskToBack(true);
                }
            }
        );
    }

    // The WebView writes its cookies to disk every 30 s or so: an app closed
    // from the recent apps right after signing in would lose the session
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    // Also called by BridgeActivity with the intent that started the app
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openSiteLink(intent);
    }

    /** A link to the site, from an e-mail or another app (AndroidManifest.xml): open it here. */
    private void openSiteLink(Intent intent) {
        Uri link = intent.getData();
        Uri site = Uri.parse(bridge.getServerUrl());
        if (
            Intent.ACTION_VIEW.equals(intent.getAction()) &&
            link != null &&
            "https".equals(link.getScheme()) &&
            site.getHost().equalsIgnoreCase(link.getHost())
        ) {
            bridge.getWebView().loadUrl(link.toString());
        }
    }

    /** From Android 8, a notification shows in a channel the player can turn off in the settings. */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            getString(R.string.notification_channel_id),
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(getString(R.string.notification_channel_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    /**
     * Capacitor shows its error page (the offline page) on a page's HTTP error
     * too: here only a network failure does, and the site's 404 or 500 page
     * shows. No plugin of the app listens to HTTP errors.
     */
    private static class SiteWebViewClient extends BridgeWebViewClient {

        SiteWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (!request.isForMainFrame()) super.onReceivedHttpError(view, request, errorResponse);
        }
    }
}
