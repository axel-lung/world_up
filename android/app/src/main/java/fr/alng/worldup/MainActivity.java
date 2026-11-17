package fr.alng.worldup;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The app's one screen: Capacitor's WebView, which shows the site
 * (capacitor.config.ts). On top of Capacitor, it opens the site's links that
 * come from elsewhere, keeps the site's own error pages, handles the back
 * button, creates the channel the notifications show in, and keeps what would
 * betray a WebView out of sight: the splash's logo stays until the site is
 * drawn, other sites open in a tab over the app, files download, the system
 * bars take the site's ground, and the page has no scrollbar.
 */
public class MainActivity extends BridgeActivity {

    /** The site's ground behind the status and navigation bars, once the site has said it (SiteGroundPlugin). */
    private Integer siteGround;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SiteGroundPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new SiteWebViewClient(this));
        WebView webView = bridge.getWebView();
        // Until the site paints its ground, the splash's logo behind it shows
        // (activity_main.xml), not an empty screen
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setDownloadListener(this::download);
        // A native screen shows no scrollbar while it scrolls
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        createNotificationChannel();
        // Back: the previous page, or, from the first one, the app goes to the background
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
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

    // Capacitor's SystemBars gives the bars the phone's light or dark ground
    // again when the phone's setting changes: the site's comes back over it
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        paintSystemBars();
    }

    /** A link to the site, from an e-mail or another app (AndroidManifest.xml): open it here. */
    private void openSiteLink(Intent intent) {
        Uri link = intent.getData();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && link != null && "https".equals(link.getScheme()) && isSite(link)) {
            bridge.getWebView().loadUrl(link.toString());
        }
    }

    private boolean isSite(Uri url) {
        return Uri.parse(bridge.getServerUrl()).getHost().equalsIgnoreCase(url.getHost());
    }

    /**
     * The site's ground, from the page at the top of the screen: the strips
     * behind the status and navigation bars take it, with icons that stand out
     * on it, so that a theme forced in the game or the pack opening's dark
     * stage doesn't sit under bars of the phone's theme.
     */
    void setSiteGround(int color) {
        siteGround = color;
        paintSystemBars();
    }

    private void paintSystemBars() {
        if (siteGround == null) return;
        Window window = getWindow();
        // SystemBars keeps the WebView clear of the bars with the decor view's
        // padding: its background is what shows behind them
        window.getDecorView().setBackgroundColor(siteGround);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        boolean lightGround = ColorUtils.calculateLuminance(siteGround) > 0.5;
        bars.setAppearanceLightStatusBars(lightGround);
        bars.setAppearanceLightNavigationBars(lightGround);
    }

    /** Another site (Wikipedia, Commons, a licence): in a tab over the app, which closes back to it, rather than in the browser. */
    private void openInTab(Uri url) {
        int ground = siteGround != null ? siteGround : ContextCompat.getColor(this, R.color.splash_background);
        CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
            .setToolbarColor(ground)
            .setNavigationBarColor(ground)
            .build();
        CustomTabsIntent tab = new CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).setShowTitle(true).build();
        try {
            tab.launchUrl(this, url);
        } catch (ActivityNotFoundException e) {
            // No browser on the phone: the link can't open anywhere
        }
    }

    /**
     * A file the site sends as an attachment, such as the player's data
     * (/account/export): a WebView doesn't download by itself. Android's
     * download manager fetches it with the session's cookies, and its
     * notification opens it.
     */
    private void download(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
        String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
        DownloadManager.Request request = new DownloadManager.Request(uri)
            .setMimeType(mimeType)
            .setTitle(fileName)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .addRequestHeader("User-Agent", userAgent);
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) request.addRequestHeader("Cookie", cookies);
        // From Android 10, Downloads takes a file without a permission; before, the app's own folder does
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        } else {
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
        }
        getSystemService(DownloadManager.class).enqueue(request);
        Toast.makeText(this, getString(R.string.download_started, fileName), Toast.LENGTH_SHORT).show();
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

    private static class SiteWebViewClient extends BridgeWebViewClient {

        private final MainActivity activity;

        SiteWebViewClient(MainActivity activity) {
            super(activity.getBridge());
            this.activity = activity;
        }

        /**
         * Capacitor shows its error page (the offline page) on a page's HTTP
         * error too: here only a network failure does, and the site's 404 or
         * 500 page shows. No plugin of the app listens to HTTP errors.
         */
        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (!request.isForMainFrame()) super.onReceivedHttpError(view, request, errorResponse);
        }

        /** A page of another site opens in a tab over the app; Capacitor would send it to the browser. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            boolean web = "https".equals(url.getScheme()) || "http".equals(url.getScheme());
            if (request.isForMainFrame() && web && !activity.isSite(url)) {
                activity.openInTab(url);
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }
    }
}
