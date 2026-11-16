import { SiteFooter, SiteHeader, SiteTabBar } from '@/components/layout/SiteHeader';

// The public and game pages share the header and footer, and a player's tab
// bar on a phone; the sign-in pages and the back-office have their own layouts.
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <div id="content" tabIndex={-1}>
        {children}
      </div>
      <SiteFooter />
      <SiteTabBar />
    </>
  );
}
