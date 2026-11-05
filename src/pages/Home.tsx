import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  ArrowDown,
  ArrowRight,
  CalendarDays,
  MessageSquare,
  CreditCard,
  Link2,
  Check,
  PenTool,
  Palette,
} from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { Button } from '../components/ui/button';
import { Photo, Reveal, Label, ArrowLink, CTA, FAQs } from '../components/Primitives';
import { StudioPanel } from '../features/workspace/StudioPanel';
import { ScrollStory } from '../components/MotionSystem';
import { useApi } from '../lib/queries';
import type { ArticleData } from '../lib/types';
import { BookingWizard } from '../features/booking/BookingFlow';
import { faqs } from '../data/site';
export default function Home() {
  const hero = useRef(null);
  const journal = useApi<{ articles: ArticleData[] }>('/articles');
  const articles = journal.data?.articles || [];
  const { scrollYProgress } = useScroll({
    target: hero,
    offset: ['start start', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '16%']);
  const reduced = useReducedMotion();
  const [booking, setBooking] = useState(false);
  const [carousel, api] = useEmblaCarousel({ align: 'start', loop: false });
  return (
    <>
      <section className="hero" ref={hero}>
        <div className="hero-copy">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Label>YOUR CRAFT FIRST. EVERYTHING ELSE, SORTED.</Label>
          </motion.div>
          <h1 aria-label="More ink. Less admin.">
            {['MORE INK.', 'LESS', 'ADMIN.'].map((line, i) => (
              <span className={`hero-line line-${i}`} key={line}>
                <motion.span
                  initial={reduced ? false : { y: '110%', rotate: 3 }}
                  animate={{ y: 0, rotate: 0 }}
                  transition={{
                    duration: 0.85,
                    delay: 0.15 + i * 0.11,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {line}
                  {i === 1 && (
                    <span className="hero-pen-mark" aria-hidden="true">
                      <PenTool />
                    </span>
                  )}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.div
            className="hero-bottom"
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.7 }}
          >
            <p>
              Your art deserves your attention.
              <br />
              Your bookings? Leave those to Venue.
            </p>
            <div className="hero-buttons">
              <Button asChild variant="dark">
                <Link to="/get-started">
                  Find your Venue <ArrowUpRight size={19} />
                </Link>
              </Button>
              <button className="play-link" onClick={() => setBooking(true)}>
                <span>
                  <PenTool size={12} />
                </span>{' '}
                Book your next piece
              </button>
            </div>
            <span className="hero-caption">Booking, payments & a little more freedom.</span>
          </motion.div>
        </div>
        <div className="hero-visual">
          <motion.div
            className="hero-photo-wrap"
            style={{ y: reduced ? 0 : y }}
            initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{
              duration: 1.1,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Photo
              name="hero-tattoo-session"
              alt="Tattoo artist concentrating on their work in a light-filled studio"
              eager
              position="52% center"
            />
          </motion.div>
          <span className="photo-label">IN THE STUDIO. IN YOUR ELEMENT.</span>
          <div className="hero-photo-shade" />
          <motion.div
            className="booking-notification"
            initial={reduced ? false : { opacity: 0, y: 30, rotate: -5 }}
            animate={{ opacity: 1, y: 0, rotate: -3 }}
            transition={{ delay: 1, duration: 0.8, type: 'spring' }}
          >
            <span className="notification-check">
              <Check size={19} />
            </span>
            <div>
              <strong>More time for this.</strong>
              <small>Less time in your DMs.</small>
            </div>
            <span className="notification-flower" aria-hidden="true">
              ↗
            </span>
          </motion.div>
          <a className="hero-scroll" href="#the-good-stuff" aria-label="Scroll to explore">
            <ArrowDown size={21} />
          </a>
          <span className="vertical-caption">MADE FOR THE ART. AND THE ARTIST.</span>
        </div>
      </section>
      <div className="marquee" aria-hidden="true">
        <div>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i}>
              YOUR ART. YOUR RULES. YOUR VENUE. <span>↗</span> LESS BACK & FORTH. MORE GOING
              FORWARD. <span>↗</span>
            </span>
          ))}
        </div>
      </div>
      <section className="intro-section container" id="the-good-stuff">
        <Reveal>
          <Label>YOUR CRAFT FIRST. EVERYTHING ELSE, SORTED.</Label>
        </Reveal>
        <div className="intro-grid">
          <Reveal>
            <h2>
              You didn’t become
              <br />
              an artist to <span className="serif-word">do admin.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p>The late-night DMs. The back-and-forth. The “did you get my deposit?”</p>
            <p>
              Bring bookings, flash, payments and conversations into one place. Less of the business
              getting in the way. More of you doing your thing.
            </p>
            <ArrowLink to="/features">Meet your new studio assistant</ArrowLink>
          </Reveal>
        </div>
      </section>
      <ScrollStory />
      <section className="product-section">
        <div className="container">
          <div className="section-heading">
            <Reveal>
              <Label>EVERYTHING IN ITS RIGHT PLACE</Label>
              <h2>
                A little structure.
                <br />A lot of freedom.
              </h2>
            </Reveal>
            <Reveal>
              <p>
                Your day, without the dozen open tabs.
                <br />
                Go on. Make yourself at home.
              </p>
              <ArrowLink to="/dashboard">Explore the workspace</ArrowLink>
            </Reveal>
          </div>
          <Reveal className="product-stage">
            <div className="product-sticker" aria-hidden="true">
              LESS MESS.
              <br />
              MORE YES.<span>↙</span>
            </div>
            <StudioPanel />
          </Reveal>
          <div className="feature-strip">
            {[
              {
                icon: CalendarDays,
                title: 'Books that work for you',
                text: 'Your availability. Your boundaries.',
                to: '/booking',
              },
              {
                icon: MessageSquare,
                title: 'Conversations, together',
                text: 'Keep the details out of your DMs.',
                to: '/features',
              },
              {
                icon: CreditCard,
                title: 'Payments without the chase',
                text: 'Clear quotes. Flexible payment choices.',
                to: '/payments',
              },
              {
                icon: Link2,
                title: 'A home for your work',
                text: 'One link. Entirely your world.',
                to: '/artist-websites',
              },
            ].map((f, i) => (
              <Reveal delay={i * 0.07} key={f.title}>
                <Link to={f.to}>
                  <f.icon size={22} />
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <ArrowUpRight size={19} />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="artist-editorial container">
        <div className="editorial-photo">
          <Reveal>
            <Photo name="artist-at-work" alt="Tattoo artist carefully working with a client" />
          </Reveal>
          <span className="photo-corner">01 / THE INDEPENDENTS</span>
          <div className="round-stamp" aria-hidden="true">
            STAY TRUE
            <br />
            <span>↗</span>
            <br />
            TO YOUR ART
          </div>
        </div>
        <Reveal className="editorial-copy">
          <Label>FOR THE ONES WHO MAKE THEIR OWN MARK</Label>
          <h2>
            Your books.
            <br />
            Your style.
            <br />
            <span className="serif-word">Your rules.</span>
          </h2>
          <p>
            From your first flash drop to your next guest spot. A booking space that works the way
            you do, and looks like you, too.
          </p>
          <ArrowLink to="/for-tattoo-artists">Made for independent artists</ArrowLink>
        </Reveal>
      </section>
      <section className="flash-section">
        <div className="container">
          <div className="section-heading">
            <Reveal>
              <Label light>GOOD IDEAS DESERVE TO GET INKED</Label>
              <h2>
                Off the sketchbook.
                <br />
                Onto someone’s skin.
              </h2>
            </Reveal>
            <Reveal>
              <p>
                Your flash deserves more than a disappearing story. Give every collection a place to
                live, be found and be booked.
              </p>
              <ArrowLink light to="/flash">
                Explore flash collections
              </ArrowLink>
            </Reveal>
          </div>
          <div className="flash-editorial-grid">
            <Reveal>
              <Link to="/flash" className="flash-photo-card">
                <Photo name="tattoo-floral-detail" alt="Detailed floral tattoo artwork on skin" />
                <div>
                  <span>THE BOTANICAL STUDIES</span>
                  <ArrowUpRight />
                </div>
              </Link>
            </Reveal>
            <Reveal delay={0.12}>
              <Link to="/flash" className="flash-photo-card offset-card">
                <Photo
                  name="tattoo-back-art"
                  alt="Blackwork tattoo composition showing detailed linework"
                />
                <div>
                  <span>A STUDY IN BLACK</span>
                  <ArrowUpRight />
                </div>
              </Link>
            </Reveal>
            <Reveal delay={0.24}>
              <Link to="/flash" className="flash-photo-card">
                <Photo name="tattoo-arm-floral" alt="Floral tattoo detail on a tattooed arm" />
                <div>
                  <span>SMALL MARKS. BIG FEELINGS.</span>
                  <ArrowUpRight />
                </div>
              </Link>
            </Reveal>
          </div>
          <p className="image-context">An editorial look at line, form and the craft.</p>
        </div>
      </section>
      <section className="studio-section container">
        <Reveal className="studio-copy">
          <Label>FOR THE WHOLE CREATIVE COLLECTIVE</Label>
          <h2>
            Different artists.
            <br />
            One <span className="serif-word">happy studio.</span>
          </h2>
          <p>
            A shared calendar. Individual booking links. All your people, doing what they do best.
            Keep the studio in sync without losing anyone’s independence.
          </p>
          <div className="tag-list">
            <span>Team calendars</span>
            <span>Guest artists</span>
            <span>Artist availability</span>
          </div>
          <ArrowLink to="/studios">Meet Venue for studios</ArrowLink>
        </Reveal>
        <Reveal className="studio-photo">
          <Photo
            name="studio-community"
            alt="Artists and clients sharing a creative studio space"
          />
          <span className="studio-photo-note">
            GOOD ENERGY.
            <br />
            BETTER ORGANIZATION. ↗
          </span>
        </Reveal>
      </section>
      <section className="services-ribbon container">
        <span>MORE THAN TATTOOS.</span>
        <Link to="/services">
          Piercing <ArrowUpRight size={15} />
        </Link>
        <Link to="/services">
          Permanent makeup <ArrowUpRight size={15} />
        </Link>
        <Link to="/services">
          Tattoo removal <ArrowUpRight size={15} />
        </Link>
        <Link to="/services">
          Tooth gems <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className="mobile-promo">
        <div className="container mobile-promo-grid">
          <Reveal className="mobile-promo-visual">
            <Photo name="artist-portrait-woman" alt="Creative tattoo artist in their studio" />
            <div className="phone-frame">
              <span className="phone-island" />
              <div className="phone-app">
                <span className="wordmark">venue↗</span>
                <small>YOUR SPACE, ANYWHERE</small>
                <h3>
                  Hey, artist.
                  <br />
                  Make it a good one.
                </h3>
                <div className="phone-date">
                  {new Date()
                    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    .toUpperCase()}
                </div>
                <Link className="phone-appointment" to="/booking">
                  <span className="status">YOUR NEXT CHAPTER</span>
                  <strong>Make your next mark.</strong>
                  <span>Find an artist. Share the idea.</span>
                  <i>Book a session ↗</i>
                </Link>
                <Link className="phone-appointment violet" to="/dashboard">
                  <strong>Your work, together.</strong>
                  <span>Bookings. Conversations. Headspace.</span>
                </Link>
                <nav>
                  <Link to="/dashboard?tab=calendar" aria-label="Open calendar">
                    <CalendarDays />
                  </Link>
                  <Link to="/dashboard?tab=bookings" aria-label="Open booking conversations">
                    <MessageSquare />
                  </Link>
                  <Link to="/flash" aria-label="Explore artwork">
                    <Palette />
                  </Link>
                </nav>
              </div>
            </div>
          </Reveal>
          <Reveal className="mobile-promo-copy">
            <Label>YOUR STUDIO IS A STATE OF MIND</Label>
            <h2>
              Big ideas.
              <br />
              Pocket-sized
              <br />
              <span className="serif-word">freedom.</span>
            </h2>
            <p>
              At the studio. On a guest spot. On the sofa. Keep your books close and your options
              open with Venue in your browser on iOS and Android.
            </p>
            <ArrowLink to="/info/mobile-app">Take Venue with you</ArrowLink>
          </Reveal>
        </div>
      </section>
      <section className="pricing-teaser container">
        <Reveal>
          <Label>A LITTLE MORE TRANSPARENCY</Label>
          <h2>
            Start free.
            <br />
            Grow your own way.
          </h2>
          <p>
            Create your account and bring your books together.
            <br />
            Service prices and custom quotes are agreed with your artist.
          </p>
          <ArrowLink to="/pricing">Find the fit for your books</ArrowLink>
        </Reveal>
        <Reveal className="pricing-teaser-number">
          <span>PLATFORM ACCESS</span>
          <div>
            $0<small>/ month</small>
          </div>
          <p>
            Your account. Your workspace.
            <br />
            Service quotes stay with your artist.
          </p>
          <span className="pricing-scribble" aria-hidden="true">
            less overhead.
            <br />
            more headspace. ↗
          </span>
        </Reveal>
      </section>
      <section className="journal-section">
        <div className="container">
          <div className="section-heading">
            <Reveal>
              <Label>NOTES FROM THE STUDIO</Label>
              <h2>
                A little perspective.
                <br />A lot of good stuff.
              </h2>
            </Reveal>
            <div className="carousel-controls">
              <button aria-label="Previous stories" onClick={() => api?.scrollPrev()}>
                <ArrowLeftIcon />
              </button>
              <button aria-label="Next stories" onClick={() => api?.scrollNext()}>
                <ArrowRight />
              </button>
              <ArrowLink to="/journal">The journal</ArrowLink>
            </div>
          </div>
          <div className="embla" ref={carousel}>
            <div className="embla-container">
              {articles.slice(0, 3).map((a, i) => (
                <article className="journal-card embla-slide" key={a.slug}>
                  <Link to={`/journal/${a.slug}`}>
                    <div className="journal-image">
                      <Photo name={a.image_name} alt={a.title} />
                      <span className="journal-arrow">
                        <ArrowUpRight />
                      </span>
                    </div>
                    <small>
                      {a.category.toUpperCase()} <span>0{i + 1}</span>
                    </small>
                    <h3>{a.title}</h3>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="faq-section container">
        <Reveal>
          <Label>BEFORE YOU ASK</Label>
          <h2>
            Good questions.
            <br />
            Straight answers.
          </h2>
          <ArrowLink to="/help">A little more help</ArrowLink>
        </Reveal>
        <Reveal>
          <FAQs items={faqs.slice(0, 5)} />
        </Reveal>
      </section>
      <CTA />
      <BookingWizard open={booking} onOpenChange={setBooking} />
    </>
  );
}
function ArrowLeftIcon() {
  return <ArrowRight style={{ transform: 'rotate(180deg)' }} />;
}
