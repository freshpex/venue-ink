import { Component, Suspense, lazy, useEffect } from "react";
import type { ReactNode } from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Layout } from "./components/Layout";
import { routeInfo } from "./data/site";
const Home = lazy(() => import("./pages/Home"));
const Features = lazy(() => import("./pages/Features"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Mobile = lazy(() =>
  import("./pages/Features").then((m) => ({ default: m.MobileApp })),
);
const ArtistWebsites = lazy(() =>
  import("./pages/Features").then((m) => ({ default: m.ArtistWebsites })),
);
const Journal = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Journal })),
);
const Article = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Article })),
);
const Help = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Help })),
);
const Contact = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Contact })),
);
const GetStarted = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.GetStarted })),
);
const Demo = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Demo })),
);
const Credits = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.Credits })),
);
const NotFound = lazy(() =>
  import("./pages/Resources").then((m) => ({ default: m.NotFound })),
);
const Login = lazy(() =>
  import("./pages/Workspace").then((m) => ({ default: m.WorkspaceLogin })),
);
const Workspace = lazy(() =>
  import("./pages/Workspace").then((m) => ({ default: m.Workspace })),
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty-state">
        <h1>A little interruption.</h1>
        <p>The page couldn’t load. Refresh to try again.</p>
        <button
          className="button button-dark"
          onClick={() => location.reload()}
        >
          Reload page
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Metadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const info = routeInfo[pathname] || {
      title: pathname.startsWith("/journal/")
        ? "The Venue journal"
        : "Explore Venue",
      description: "A new perspective on tattoo booking and studio management.",
    };
    document.title = `${info.title} | Venue Ink`;
    const desc = document.querySelector('meta[name="description"]');
    desc?.setAttribute("content", info.description);
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = new URL(pathname, window.location.origin).href;
  }, [pathname]);
  return null;
}
export default function App() {
  const location = useLocation();
  const reduced = useReducedMotion();
  return (
    <ErrorBoundary>
      <Metadata />
      <Layout>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={reduced ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense
              fallback={
                <div className="page-loading" role="status">
                  <span className="loading-mark">✳</span> Making a little space…
                </div>
              }
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                {[
                  "/for-tattoo-artists",
                  "/studios",
                  "/features",
                  "/booking",
                  "/payments",
                  "/services",
                  "/about",
                ].map((path) => (
                  <Route key={path} path={path} element={<Features />} />
                ))}
                <Route
                  path="/book-smarter"
                  element={<Navigate to="/booking" replace />}
                />
                <Route path="/flash" element={<Gallery />} />
                <Route path="/artist-websites" element={<ArtistWebsites />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/info/mobile-app" element={<Mobile />} />
                <Route path="/journal" element={<Journal />} />
                <Route
                  path="/blog"
                  element={<Navigate to="/journal" replace />}
                />
                <Route path="/journal/:slug" element={<Article />} />
                <Route path="/blog/:slug" element={<Article />} />
                <Route path="/help" element={<Help />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/get-started" element={<GetStarted />} />
                <Route path="/demo" element={<Demo />} />
                <Route path="/credits" element={<Credits />} />
                <Route path="/workspace/login" element={<Login />} />
                <Route path="/workspace/register" element={<Login />} />
                <Route path="/workspace" element={<Workspace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </Layout>
    </ErrorBoundary>
  );
}
