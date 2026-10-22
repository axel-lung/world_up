// The Android app (android/) is a Trusted Web Activity: Chrome opens the site
// in it, without its address bar, once /.well-known/assetlinks.json names the
// app and the SHA-256 fingerprints of the certificates it is signed with.
// Both come from the environment: ANDROID_APP_ID, and ANDROID_CERT_FINGERPRINTS
// (Play Console > Test and release > App integrity: the app signing key, which
// signs what the Play Store installs, and the upload key, which signs the APK
// built by the "Android app" workflow). Without them, no app is declared.

export type AssetLinkStatement = {
  relation: string[];
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] };
};

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function assetLinks(env: Record<string, string | undefined>): AssetLinkStatement[] {
  const appId = env.ANDROID_APP_ID?.trim();
  const fingerprints = (env.ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!appId || fingerprints.length === 0) return [];
  // A mistyped fingerprint would silently put the address bar back in the app
  for (const fingerprint of fingerprints) {
    if (!FINGERPRINT.test(fingerprint)) throw new Error(`Invalid ANDROID_CERT_FINGERPRINTS entry: ${fingerprint}`);
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: appId, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
