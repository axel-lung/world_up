import { describe, expect, it } from 'vitest';
import { assetLinks } from './android-app';

const play = '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';
const upload = 'ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89';

describe('assetLinks', () => {
  it('declares the app with every certificate it is signed with', () => {
    expect(assetLinks({ ANDROID_APP_ID: 'fr.example.app', ANDROID_CERT_FINGERPRINTS: `${play}, ${upload}` })).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'fr.example.app',
          sha256_cert_fingerprints: [play, upload.toUpperCase()],
        },
      },
    ]);
  });

  it('declares no app until both values are set', () => {
    expect(assetLinks({})).toEqual([]);
    expect(assetLinks({ ANDROID_APP_ID: 'fr.example.app', ANDROID_CERT_FINGERPRINTS: '' })).toEqual([]);
    expect(assetLinks({ ANDROID_CERT_FINGERPRINTS: play })).toEqual([]);
  });

  it('rejects a mistyped fingerprint', () => {
    expect(() => assetLinks({ ANDROID_APP_ID: 'fr.example.app', ANDROID_CERT_FINGERPRINTS: play.slice(3) })).toThrow(
      'Invalid ANDROID_CERT_FINGERPRINTS entry',
    );
  });
});
