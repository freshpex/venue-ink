import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  MessageSquare,
  Palette,
  Users,
  Link2,
  Check,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { CTA, FAQs, Label, PageIntro, Photo, Reveal, ArrowLink } from '../components/Primitives';
import { StudioDemo } from '../features/demo/StudioDemo';
import { BookingWizard } from '../features/booking/BookingWizard';
import { faqs, links } from '../data/site';
const configs: Record<
  string,
  {
    label: string;
    title: string;
    text: string;
    photo: string;
    alt: string;
    heading: string;
    body: string;
    points: string[];
  }
> = {
  '/for-tattoo-artists': {
    label: 'FOR THE INDEPENDENTS',
    title: 'Make your own mark.',
    text: 'A booking space for the artist, the business and the human behind both. Less juggling. More of what you love.',
    photo: 'artist-studio-portrait',
    alt: 'Tattoo artist in a creative studio',
    heading: 'Your craft deserves your full attention.',
    body: 'Your custom requests, flash, client conversations and calendar belong together. Venue gives independent artists a way to keep the practical stuff moving, on their own terms.',
    points: [
      'One personal booking link',
      'Customizable booking forms',
      'Flash collections and client chat',
      'Deposits through the official product',
    ],
  },
  '/studios': {
    label: 'FOR THE CREATIVE COLLECTIVE',
    title: 'Good people. Great work. One studio.',
    text: 'Keep everyone in the loop without getting in everyone’s way. A shared home for your studio’s moving parts.',
    photo: 'studio-interior',
    alt: 'Interior of a professional tattoo studio',
    heading: 'Individual artists. Shared headspace.',
    body: 'Give clients one studio booking link, help requests find the right artist and keep an eye on the team calendar. Each artist can still manage their own work and relationships.',
    points: [
      'Shared team calendars',
      'Request assignment between artists',
      'Resident and guest artist intake',
      'Studio Pro automatic payment splits',
    ],
  },
  '/features': {
    label: 'THE GOOD STUFF, TOGETHER',
    title: 'A little less everything else.',
    text: 'Your art takes enough focus. Let your booking system take care of the details.',
    photo: 'tattoo-process',
    alt: 'Artist focused on a tattoo session',
    heading: 'From the first idea to the final detail.',
    body: 'Venue combines booking forms, flash, scheduling, conversations and payments. Spend less time stitching together different tools and more time with the work in front of you.',
    points: [
      'Booking requests and reference images',
      'Availability and calendar tools',
      'Automated client reminders',
      'Your own artist website',
    ],
  },
  '/booking': {
    label: 'LESS BACK & FORTH',
    title: 'Booking, on your terms.',
    text: 'Turn “I’ve been thinking about a tattoo…” into a request with the details you actually need.',
    photo: 'tattoo-consultation',
    alt: 'Tattoo artist and client discussing artwork',
    heading: 'Good work starts with a good conversation.',
    body: 'Custom forms help clients share their idea. Review requests, keep the conversation together and propose a time or share your availability. Try the example to see how the pieces fit.',
    points: [
      'Customizable intake forms',
      'Reference images and creative notes',
      'Artist review before confirmation',
      'Booking terms within the live product',
    ],
  },
  '/payments': {
    label: 'THE BUSINESS SIDE, SIMPLIFIED',
    title: 'A smooth finish to great work.',
    text: 'Less chasing deposits. More clarity for you and your clients. Keep real payments in the official Venue product.',
    photo: 'tattoo-machine-flatlay',
    alt: 'Professional tattoo machine and studio supplies',
    heading: 'Know what happens after the request.',
    body: 'Venue uses Stripe for deposits and card payments. Clients can review applicable terms and fees in the real checkout. Available payment methods and payouts depend on location and eligibility.',
    points: [
      'Deposits and full payment collection',
      'Cards and supported digital wallets',
      'Published Solo fees: 10%',
      'Pro card processing: 5%, plus subscription',
    ],
  },
  '/services': {
    label: 'ROOM FOR EVERY KIND OF CRAFT',
    title: 'A studio isn’t just one thing.',
    text: 'Tattooing, piercing, permanent makeup and more. Organize the services your studio actually offers.',
    photo: 'studio-session',
    alt: 'People meeting in a studio setting',
    heading: 'Different services. One organized space.',
    body: 'Venue lists PMU, piercing, tattoo removal and tooth gems among the additional services studios can organize. Service providers handle procedures, suitability, pricing and consent.',
    points: [
      'Tattoo appointments',
      'Piercing and permanent makeup',
      'Tattoo removal and tooth gems',
      'Service-specific booking forms',
    ],
  },
  '/about': {
    label: 'MADE FOR THE PEOPLE BEHIND THE ART',
    title: 'Art deserves a little more space.',
    text: 'Venue brings the business of tattooing together, so artists can keep their attention on the craft.',
    photo: 'studio-vintage',
    alt: 'Vintage details inside a tattoo studio',
    heading: 'Technology that understands the studio.',
    body: 'Venue describes itself as a platform built for tattoo artists. Its tools connect bookings, flash, client conversations and payments, with studio features for teams and additional services.',
    points: [
      'Purpose-built artist booking tools',
      'Individual creativity and team coordination',
      'Clients book through a browser',
      'Web and mobile access',
    ],
  },
};
export default function Features() {
  const location = useLocation();
  const config = configs[location.pathname] || configs['/features'];
  const [booking, setBooking] = useState(false);
  const studio = location.pathname === '/studios';
  return (
    <>
      <section className={`feature-hero ${studio ? 'violet-hero' : ''}`}>
        <div className="container">
          <Reveal className="feature-hero-copy">
            <Label>{config.label}</Label>
            <h1>{config.title}</h1>
            <p>{config.text}</p>
            <Button asChild variant="dark">
              <Link to="/get-started">
                Find your Venue <ArrowUpRight size={18} />
              </Link>
            </Button>
          </Reveal>
          <Reveal className="feature-hero-photo" delay={0.15}>
            <Photo name={config.photo} alt={config.alt} eager />
            <span className="image-corner-label">THE CRAFT COMES FIRST.</span>
          </Reveal>
        </div>
      </section>
      <section className="container detail-story split">
        <Reveal>
          <Label>EVERYTHING IN ITS RIGHT PLACE</Label>
          <h2>{config.heading}</h2>
          <p>{config.body}</p>
          <ul className="check-list">
            {config.points.map((p) => (
              <li key={p}>
                <Check size={18} />
                {p}
              </li>
            ))}
          </ul>
          <Button onClick={() => setBooking(true)}>
            Try the booking example <ArrowUpRight size={18} />
          </Button>
        </Reveal>
        <Reveal>
          <Photo
            name={studio ? 'tools-workstation' : 'tattoo-overhead'}
            alt="Tools and attention to detail in a working tattoo studio"
          />
        </Reveal>
      </section>
      <section className="product-section">
        <div className="container">
          <div className="section-heading">
            <Reveal>
              <Label>TAKE THE ARTIST’S SEAT</Label>
              <h2>
                A little hands-on
                <br />
                makes it click.
              </h2>
            </Reveal>
            <p>
              Explore the calendar, review a request,
              <br />
              or try a conversation. It all stays in the example.
            </p>
          </div>
          <Reveal>
            <StudioDemo />
          </Reveal>
        </div>
      </section>
      <section className="container feature-directory">
        <Label>MAKE IT YOUR OWN</Label>
        <h2>Your next favorite tools.</h2>
        <div>
          {[
            {
              icon: CalendarDays,
              name: 'Bookings & scheduling',
              text: 'Start with the right questions. End with a date.',
              to: '/booking',
            },
            {
              icon: Palette,
              name: 'Flash collections',
              text: 'Make room for the work you want to make.',
              to: '/flash',
            },
            {
              icon: Link2,
              name: 'Artist websites',
              text: 'One link, with a little more personality.',
              to: '/artist-websites',
            },
            {
              icon: CreditCard,
              name: 'Deposits & payments',
              text: 'The practical side, kept in the official app.',
              to: '/payments',
            },
            {
              icon: Users,
              name: 'Studio tools',
              text: 'Bring the whole creative collective together.',
              to: '/studios',
            },
            {
              icon: MessageSquare,
              name: 'Client communication',
              text: 'Keep the details together, away from your DMs.',
              to: '/demo',
            },
          ].map((f) => (
            <Link to={f.to} key={f.name}>
              <f.icon size={24} />
              <h3>{f.name}</h3>
              <p>{f.text}</p>
              <ArrowUpRight size={20} />
            </Link>
          ))}
        </div>
      </section>
      {location.pathname === '/about' && (
        <section className="about-notice container">
          <h2>About this redesign.</h2>
          <p>
            This independent implementation explores a new visual direction for Venue. The original
            company, artist accounts, payment processing and supply shop remain at{' '}
            <a href="https://www.venue.ink/">Venue’s official website</a>. No affiliation or
            production access is implied.
          </p>
        </section>
      )}
      <section className="container faq-section">
        <div>
          <Label>BEFORE YOU ASK</Label>
          <h2>A little clarity.</h2>
        </div>
        <FAQs items={studio ? [faqs[4], faqs[1], faqs[7]] : [faqs[0], faqs[3], faqs[5]]} />
      </section>
      <CTA />
      <BookingWizard open={booking} onOpenChange={setBooking} />
    </>
  );
}
export function MobileApp() {
  return (
    <>
      <PageIntro
        label="YOUR STUDIO, TO GO"
        title="Good art doesn’t stay in one place."
        text="Keep your bookings close, wherever the work takes you. Venue is available on web, iOS and Android."
      />
      <section className="container app-page split">
        <Reveal className="app-page-photo">
          <Photo name="artist-portrait-man" alt="Portrait of a tattooed creative professional" />
        </Reveal>
        <Reveal>
          <Label>BIG IDEAS. POCKET-SIZED FREEDOM.</Label>
          <h2>
            Your day.
            <br />
            In your hand.
          </h2>
          <p>
            Review requests, chat with clients, track payments and check your calendar. Clients can
            still book using a browser, without downloading an app.
          </p>
          <ul className="check-list">
            {[
              'Booking requests and reference details',
              'Calendar and availability',
              'Client conversations',
              'Payment overview in the official app',
            ].map((t) => (
              <li key={t}>
                <Check size={18} />
                {t}
              </li>
            ))}
          </ul>
          <Button asChild variant="dark">
            <a href={links.app}>
              Get the official app <ArrowUpRight size={18} />
            </a>
          </Button>
          <p className="fine-print">
            Choose your device on Venue’s verified app page. Store availability may vary.
          </p>
        </Reveal>
      </section>
      <CTA />
    </>
  );
}
export function ArtistWebsites() {
  const [theme, setTheme] = useState('Paper');
  const [booking, setBooking] = useState(false);
  return (
    <>
      <PageIntro
        label="ONE LINK. ENTIRELY YOUR WORLD."
        title="Your link. Your world."
        text="Your work has a personality. Your booking page should, too. Explore three illustrative directions."
      />
      <section className="container theme-section">
        <div className="theme-controls">
          <Label>A LITTLE YOU GOES A LONG WAY</Label>
          <h2>
            Find your kind
            <br />
            of canvas.
          </h2>
          <p>
            Venue supports personal booking links, flash collections and customizable themes. This
            fictional artist page lets you try the feeling.
          </p>
          <div className="theme-swatches">
            {['Paper', 'Ink', 'Lavender'].map((t) => (
              <button
                className={theme === t ? 'selected' : ''}
                key={t}
                aria-pressed={theme === t}
                onClick={() => setTheme(t)}
              >
                <span className={`swatch ${t.toLowerCase()}`} />
                {t}
              </button>
            ))}
          </div>
          <ArrowLink to="/get-started">Make a real page with Venue</ArrowLink>
        </div>
        <Reveal className={`artist-preview theme-${theme.toLowerCase()}`}>
          <div className="preview-browser">
            <i />
            <i />
            <i />
            <span>Example artist page</span>
          </div>
          <div className="artist-preview-content">
            <small>INDEPENDENT TATTOO ARTIST · FICTIONAL PROFILE</small>
            <h2>
              River
              <br />
              <em>Studio.</em>
            </h2>
            <Photo
              name="artist-portrait-woman"
              alt="Editorial stock portrait illustrating an artist page theme"
            />
            <p>
              A little botanical. A little unexpected.
              <br />
              Made thoughtfully, for your skin.
            </p>
            <div className="tag-list">
              <span>Botanical</span>
              <span>Blackwork</span>
              <span>Custom pieces</span>
            </div>
            <Button variant="dark" onClick={() => setBooking(true)}>
              Try a booking request <ArrowUpRight size={17} />
            </Button>
            <p className="fine-print">
              Illustrative name and profile. Stock model is not a Venue artist endorsement.
            </p>
          </div>
        </Reveal>
      </section>
      <section className="container photo-trio">
        {['artist-portrait-man', 'artist-studio-portrait', 'tattoo-arm-floral'].map((name, i) => (
          <Reveal key={name} delay={i * 0.1}>
            <Photo name={name} alt="Editorial tattoo culture photography" />
          </Reveal>
        ))}
      </section>
      <CTA />
      <BookingWizard open={booking} onOpenChange={setBooking} />
    </>
  );
}
