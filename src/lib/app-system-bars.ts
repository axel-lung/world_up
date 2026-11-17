import { registerPlugin } from '@capacitor/core';

// The Android app's own plugin (android/app/src/main/java/fr/alng/worldup/SiteGroundPlugin.java):
// the strips behind the phone's status and navigation bars take the color it
// is given, with icons that stand out on it.
interface SiteGroundPlugin {
  set(options: { color: string }): Promise<void>;
}

const SiteGround = registerPlugin<SiteGroundPlugin>('SiteGround');

/**
 * The site's ground at the top of the screen, as `#rrggbb`: the player's theme,
 * forced or the phone's, or the pack opening's stage, dark in both. theme.css
 * gives --color-bg as such a value.
 */
function groundAtTop(): string | null {
  const top = document.elementFromPoint(window.innerWidth / 2, 0) ?? document.body;
  const color = getComputedStyle(top).getPropertyValue('--color-bg').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : null;
}

let painted: string | null = null;

/**
 * Gives the phone's system bars the site's ground, so that they don't keep the
 * phone's theme over a page of the other one. Called by NativeApp on each page
 * and each change of theme. Android app only.
 */
export function paintSystemBars(): void {
  const color = groundAtTop();
  if (!color || color === painted) return;
  painted = color;
  SiteGround.set({ color }).catch(() => {
    // An app from before the plugin: its bars keep the phone's theme
    painted = null;
  });
}
