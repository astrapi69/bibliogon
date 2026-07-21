import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Coordination between the two PWA update banners so at most one shows at a
 * time. In the PWA a single deploy fires both signals at once — the richer
 * {@link AppVersionUpdateBanner} (GitHub release, with notes) and the plain
 * {@link AppUpdateBanner} (Service-Worker waiting worker). This context lets the
 * release banner announce that it is active so the SW banner can step aside.
 *
 * The default value is a no-op, so a component that reads the context without a
 * surrounding {@link ReleaseBannerProvider} (e.g. an isolated unit test) simply
 * behaves as if no release banner is active.
 */
interface ReleaseBannerContextValue {
  /** True while the GitHub-release banner has a pending update on screen. */
  releaseBannerActive: boolean;
  /** Publish whether the release banner is currently showing. */
  setReleaseBannerActive: (active: boolean) => void;
}

const ReleaseBannerContext = createContext<ReleaseBannerContextValue>({
  releaseBannerActive: false,
  setReleaseBannerActive: () => {},
});

/** Provider holding the single `releaseBannerActive` flag shared by the two
 *  update banners. */
export function ReleaseBannerProvider({ children }: { children: ReactNode }) {
  const [releaseBannerActive, setReleaseBannerActive] = useState(false);
  return (
    <ReleaseBannerContext.Provider
      value={{ releaseBannerActive, setReleaseBannerActive }}
    >
      {children}
    </ReleaseBannerContext.Provider>
  );
}

/** Read the shared release-banner coordination state. */
export function useReleaseBanner(): ReleaseBannerContextValue {
  return useContext(ReleaseBannerContext);
}
