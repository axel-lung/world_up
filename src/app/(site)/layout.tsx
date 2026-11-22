import { SiteAnnouncement, SiteFooter, SiteHeader, SitePushPrompt, SiteTabBar } from '@/components/layout/SiteHeader';

// The public and game pages share the header and footer, and a player's tab
// bar on a phone, with the back-office's announcement under the header; the
// sign-in pages and the back-office have their own layouts.
// In the app, a player is asked to turn the notifications on (SitePushPrompt).
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <SiteAnnouncement />
      <div id="content" tabIndex={-1}>
        {children}
      </div>
      <SiteFooter />
      <SiteTabBar />
      <SitePushPrompt />
    </>
  );
}
