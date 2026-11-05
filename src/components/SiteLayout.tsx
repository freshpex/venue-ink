import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, ChevronDown, Menu, X, UserRound, PenTool } from 'lucide-react';
import { AnimatePresence, motion, useScroll, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { navFeatures } from '../data/site';
import { useSession, useApi } from '../lib/queries';
import { TouchFeedback, MobileBookingAction } from './MotionSystem';
import { CookiePreferences } from './CookiePreferences';
export function Logo() {
  const site = useApi<{ settings: { brand_name: string } }>('/site');
  return (
    <span className="wordmark">
      {site.data?.settings.brand_name.toLowerCase() || 'venue'}
      <span className="logo-arrow">
        <ArrowUpRight size={26} />
      </span>
    </span>
  );
}
export function Layout({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [features, setFeatures] = useState(false);
  const location = useLocation();
  const session = useSession();
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  useEffect(() => {
    setMenu(false);
    setFeatures(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  const account = session.data?.role === 'admin' ? '/admin' : '/dashboard';
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <motion.div className="scroll-progress" style={{ scaleX: scrollYProgress }} />
      <header className="site-header">
        <Link aria-label="Venue home" to="/">
          <Logo />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <div
            className="feature-nav"
            onMouseEnter={() => setFeatures(true)}
            onMouseLeave={() => setFeatures(false)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setFeatures(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setFeatures(false);
            }}
          >
            <button
              aria-expanded={features}
              aria-controls="feature-menu"
              onClick={() => setFeatures((value) => !value)}
            >
              The good stuff
              <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {features && (
                <motion.div
                  id="feature-menu"
                  className="mega-menu"
                  initial={{ opacity: 0, y: 22, rotateX: -10 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 23 }}
                >
                  {navFeatures.map((feature, index) => (
                    <motion.div
                      key={feature.path}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link to={feature.path}>
                        <span>
                          {feature.label}
                          <ArrowUpRight size={17} />
                        </span>
                        <small>{feature.detail}</small>
                      </Link>
                    </motion.div>
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
          <Link className="login-link" to={session.data ? account : '/login'}>
            {session.data ? (
              <>
                <UserRound size={14} /> My workspace
              </>
            ) : (
              <>
                Log in
                <ArrowUpRight size={13} />
              </>
            )}
          </Link>
          <Button asChild variant="dark" size="small">
            <Link to={session.data ? '/booking' : '/get-started'}>
              {session.data ? 'Book a session' : 'Get started'}
              <ArrowUpRight size={16} />
            </Link>
          </Button>
          <Dialog.Root open={menu} onOpenChange={setMenu}>
            <Dialog.Trigger className="mobile-menu-trigger" aria-label="Open navigation">
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
                <Dialog.Close className="icon-button drawer-close" aria-label="Close navigation">
                  <X />
                </Dialog.Close>
                <nav aria-label="Mobile navigation">
                  {[
                    { path: '/', label: 'Home' },
                    { path: '/artists', label: 'Find an artist' },
                    { path: '/for-tattoo-artists', label: 'For artists' },
                    { path: '/studios', label: 'For studios' },
                    ...navFeatures,
                    { path: '/pricing', label: 'Pricing' },
                    { path: '/events', label: 'Events' },
                    { path: '/journal', label: 'Journal' },
                    { path: '/contact', label: 'Talk to us' },
                  ].map((item, index) => (
                    <motion.div
                      key={item.path}
                      initial={reduced ? false : { x: 55, opacity: 0, rotate: 3 }}
                      animate={{ x: 0, opacity: 1, rotate: 0 }}
                      transition={{
                        delay: index * 0.045,
                        type: 'spring',
                        stiffness: 180,
                        damping: 22,
                      }}
                    >
                      <Link to={item.path}>
                        {item.label}
                        <ArrowUpRight size={23} />
                      </Link>
                    </motion.div>
                  ))}
                  <Link to={session.data ? account : '/login'}>
                    {session.data ? 'My workspace' : 'Sign in'}
                    <ArrowUpRight size={23} />
                  </Link>
                </nav>
                <div className="drawer-craft">
                  <PenTool size={30} />
                  <span>MAKE YOUR NEXT MARK.</span>
                </div>
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
            <Link className="social-link" to="/booking">
              <PenTool size={18} /> Make your next mark
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div>
            <h3>The good stuff</h3>
            {navFeatures.map((item) => (
              <Link key={item.path} to={item.path}>
                {item.label}
              </Link>
            ))}
          </div>
          <div>
            <h3>Your Venue</h3>
            <Link to="/artists">Find an artist</Link>
            <Link to="/studios">For studios</Link>
            <Link to="/pricing">Service pricing</Link>
            <Link to="/services">Studio services</Link>
            <Link to="/events">Events & flash days</Link>
            <Link to="/info/mobile-app">Venue on your phone</Link>
          </div>
          <div>
            <h3>Stay connected</h3>
            <Link to="/about">About Venue</Link>
            <Link to="/journal">Journal</Link>
            <Link to="/help">FAQ & help</Link>
            <Link to="/contact">Contact</Link>
            <Link to={account}>My workspace</Link>
            <Link to="/register">Create an account</Link>
          </div>
        </div>
        <div className="footer-huge" aria-hidden="true">
          make your mark
          <ArrowUpRight />
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Venue</span>
          <div>
            <Link to="/terms">Terms of service</Link>
            <Link to="/booking-terms">Booking terms</Link>
            <Link to="/privacy">Privacy</Link>
            <CookiePreferences />
            <Link to="/credits">Photo credits</Link>
          </div>
          <span>Room for the craft. Space for you.</span>
        </div>
      </footer>
      <TouchFeedback />
      <MobileBookingAction />
    </>
  );
}
