import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronDown, Menu, X, Instagram } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useReducedMotion,
} from "motion/react";
import { Button } from "./ui/button";
import { links, navFeatures } from "../data/site";
export function Logo() {
  return (
    <span className="wordmark">
      venue<span className="logo-dot">✳</span>
    </span>
  );
}
export function Layout({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [features, setFeatures] = useState(false);
  const location = useLocation();
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  useEffect(() => {
    setMenu(false);
    setFeatures(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <motion.div
        className="scroll-progress"
        style={{ scaleX: scrollYProgress }}
      />
      <header className="site-header">
        <Link aria-label="Venue home" to="/">
          <Logo />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <div
            className="feature-nav"
            onMouseEnter={() => setFeatures(true)}
            onMouseLeave={() => setFeatures(false)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setFeatures(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFeatures(false);
            }}
          >
            <button
              aria-expanded={features}
              aria-controls="feature-menu"
              onClick={() => setFeatures(!features)}
            >
              The good stuff <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {features && (
                <motion.div
                  id="feature-menu"
                  className="mega-menu"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  {navFeatures.map((f) => (
                    <Link to={f.path} key={f.path}>
                      <span>
                        {f.label}
                        <ArrowUpRight size={17} />
                      </span>
                      <small>{f.detail}</small>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <NavLink to="/for-tattoo-artists">For artists</NavLink>
          <NavLink to="/studios">For studios</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/journal">Journal</NavLink>
        </nav>
        <div className="header-actions">
          <a className="login-link" href={links.login}>
            Log in <ArrowUpRight size={13} />
          </a>
          <Button asChild variant="dark" size="small">
            <Link to="/get-started">
              Get started <ArrowUpRight size={16} />
            </Link>
          </Button>
          <Dialog.Root open={menu} onOpenChange={setMenu}>
            <Dialog.Trigger
              className="mobile-menu-trigger"
              aria-label="Open navigation"
            >
              <Menu />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-drawer">
                <Dialog.Title>
                  <Logo />
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Explore Venue’s booking tools and resources.
                </Dialog.Description>
                <Dialog.Close
                  className="icon-button drawer-close"
                  aria-label="Close navigation"
                >
                  <X />
                </Dialog.Close>
                <nav aria-label="Mobile navigation">
                  {[
                    { path: "/", label: "Home" },
                    { path: "/for-tattoo-artists", label: "For artists" },
                    { path: "/studios", label: "For studios" },
                    ...navFeatures,
                    { path: "/pricing", label: "Pricing" },
                    { path: "/journal", label: "Journal" },
                    { path: "/contact", label: "Talk to us" },
                  ].map((n, i) => (
                    <motion.div
                      initial={reduced ? false : { x: 25, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.035 }}
                      key={n.path}
                    >
                      <Link to={n.path}>
                        {n.label}
                        <ArrowUpRight size={23} />
                      </Link>
                    </motion.div>
                  ))}
                  <a href={links.login}>
                    Log in to Venue <ArrowUpRight size={23} />
                  </a>
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <div>
            <Link aria-label="Venue home" to="/">
              <Logo />
            </Link>
            <p>
              Made for the art.
              <br />
              And the people behind it.
            </p>
            <a
              className="social-link"
              href={links.instagram}
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={18} /> Follow the culture{" "}
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div>
            <h3>The good stuff</h3>
            {navFeatures.map((n) => (
              <Link key={n.path} to={n.path}>
                {n.label}
              </Link>
            ))}
          </div>
          <div>
            <h3>Your Venue</h3>
            <Link to="/for-tattoo-artists">For artists</Link>
            <Link to="/studios">For studios</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/services">Studio services</Link>
            <Link to="/info/mobile-app">The mobile app</Link>
            <a href={links.store}>Members Only supplies ↗</a>
          </div>
          <div>
            <h3>Stay curious</h3>
            <Link to="/about">About Venue</Link>
            <Link to="/journal">Journal</Link>
            <Link to="/help">FAQ & help</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/demo">Explore the demo</Link>
            <Link to="/workspace/login">Preview workspace</Link>
          </div>
        </div>
        <div className="footer-huge" aria-hidden="true">
          make your mark<span>✳</span>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Venue redesign preview</span>
          <div>
            <a href={links.terms}>Artist terms ↗</a>
            <a href={links.clientTerms}>Client terms ↗</a>
            <a href={links.privacy}>Privacy ↗</a>
            <Link to="/credits">Photo credits</Link>
          </div>
          <span>Independent concept. Live actions open Venue.</span>
        </div>
      </footer>
    </>
  );
}
