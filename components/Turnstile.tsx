/**
 * Cloudflare Turnstile widget for Expo Go.
 *
 * There is no native Turnstile SDK that runs in Expo Go, so we render the official
 * web widget inside a WebView and bridge the token back via postMessage. Used by the
 * forgot-password flow to gate the `check-email` Edge Function (the only path to the
 * existence check now that the anon RPC oracle is gone).
 *
 * Setup: create a Turnstile site in the Cloudflare dashboard, put the (public) site key
 * in EXPO_PUBLIC_TURNSTILE_SITE_KEY, and either add `TURNSTILE_BASE_URL`'s hostname to
 * the site's allowed domains or enable "allow any hostname" for mobile. The secret key
 * lives only in the Edge Function (TURNSTILE_SECRET_KEY) — never in the client.
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors } from '../theme/tokens';

// Turnstile validates the page's hostname against the site's allowed-domains list.
// A WebView serves inline HTML under this baseUrl, so its hostname must be allowed
// (or the site set to "allow any hostname").
const BASE_URL = 'https://habit-tracker.local';

type Props = {
  siteKey: string;
  /** Fired with a fresh token when the challenge is solved. */
  onToken: (token: string) => void;
  /** Fired when the token errors or expires — the consumer should clear any held token. */
  onError?: () => void;
  style?: ViewStyle;
};

function buildHtml(siteKey: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadCb&render=explicit" async defer></script>
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #cf { display: flex; justify-content: center; }
    </style>
  </head>
  <body>
    <div id="cf"></div>
    <script>
      function post(m) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
      }
      window.onloadCb = function () {
        try {
          turnstile.render('#cf', {
            sitekey: ${JSON.stringify(siteKey)},
            theme: 'dark',
            callback: function (t) { post({ type: 'token', token: t }); },
            'error-callback': function () { post({ type: 'error' }); },
            'expired-callback': function () { post({ type: 'expired' }); },
          });
        } catch (e) { post({ type: 'error' }); }
      };
    </script>
  </body>
</html>`;
}

export function Turnstile({ siteKey, onToken, onError, style }: Props) {
  const html = useMemo(() => buildHtml(siteKey), [siteKey]);

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg?.type === 'token' && typeof msg.token === 'string') onToken(msg.token);
        else if (msg?.type === 'error' || msg?.type === 'expired') onError?.();
      } catch {
        onError?.();
      }
    },
    [onToken, onError]
  );

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        source={{ html, baseUrl: BASE_URL }}
        onMessage={handleMessage}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        // Inline HTML has no http(s) origin issues here; keep it minimal + transparent.
        originWhitelist={['*']}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Turnstile's managed widget is ~300x65; give it room without scrolling.
  wrap: { height: 72, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: colors.bg },
});
