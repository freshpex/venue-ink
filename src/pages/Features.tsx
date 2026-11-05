import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  MessageSquare,
  Wallet,
  Users,
  PenTool,
  Smartphone,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { CTA, FAQs, Label, PageIntro, Photo, Reveal } from '../components/Primitives';
import { StudioPanel } from '../features/workspace/StudioPanel';
import { ScrollStory } from '../components/MotionSystem';
import { useApi } from '../lib/queries';
import type { Studio } from '../lib/types';
import { faqs } from '../data/site';
const configs: Record<
  string,
  { label: string; title: string; text: string; photo: string; heading: string; body: string }
> = {
  '/for-tattoo-artists': {
    label: 'FOR THE INDEPENDENTS',
    title: 'Make your own mark.',
    text: 'A booking space for the artist, the business and the human behind both.',
    photo: 'artist-studio-portrait',
    heading: 'Your craft deserves your full attention.',
    body: 'Publish your artist page, upload your original flash, set your hours and review the requests that come in. Every booking has its own conversation and payment record.',
  },
  '/studios': {
    label: 'FOR THE CREATIVE COLLECTIVE',
    title: 'Good people. Great work. One studio.',
    text: 'Keep everyone in the loop without getting in everyone’s way.',
    photo: 'studio-interior',
    heading: 'Individual artists. Shared headspace.',
    body: 'Invite artists into your studio, manage your services and follow the team’s requests in one workspace. Artists keep their own availability and personal booking pages.',
  },
  '/features': {
    label: 'THE GOOD STUFF, TOGETHER',
    title: 'A little less everything else.',
    text: 'Your art takes enough focus. Give the practical details a place of their own.',
    photo: 'tattoo-process',
    heading: 'From the first idea to the final detail.',
    body: 'Requests, reference images, available times and conversations belong together. Venue gives the client and studio a shared place to follow the work.',
  },
  '/payments': {
    label: 'THE BUSINESS SIDE, SIMPLIFIED',
    title: 'A smooth finish to great work.',
    text: 'Keep your quote, deposit and booking progress together.',
    photo: 'tattoo-machine-flatlay',
    heading: 'Clear next steps. One conversation.',
    body: 'Your appointment, quote and payment records stay in one place, so you and your studio can keep every detail clear. Choose from flexible payment options and stay focused on the artwork ahead.',
  },
  '/services': {
    label: 'THE WHOLE STUDIO',
    title: 'Room for your kind of craft.',
    text: 'Tattooing, piercing, permanent makeup and other studio services, organized around the people doing the work.',
    photo: 'tools-workstation',
    heading: 'A service for the work you do.',
    body: 'Studios manage service names, durations, prices and deposit requirements. Clients choose a service before requesting a time, and the assigned artist reviews the details.',
  },
  '/about': {
    label: 'ART FIRST. PEOPLE ALWAYS.',
    title: 'Space for the work. Room for you.',
    text: 'Venue brings the creative and practical sides of studio life together.',
    photo: 'studio-community',
    heading: 'The craft comes first.',
    body: 'A good appointment begins long before the machine starts. We bring ideas, artist pages, schedules and conversations into one place, so the people making the work can focus on it.',
  },
};
export default function Features() {
  const { pathname } = useLocation();
  const config = configs[pathname] || configs['/features'];
  const studios = useApi<{ studios: Studio[] }>('/studios', { enabled: pathname === '/studios' });
  return (
    <>
      <PageIntro label={config.label} title={config.title} text={config.text} />
      <section className="container detail-story split">
        <Reveal>
          <Photo name={config.photo} alt="Tattoo studio life" eager />
        </Reveal>
        <Reveal>
          <Label>MADE FOR THE WAY YOU WORK</Label>
          <h2>{config.heading}</h2>
          <p>{config.body}</p>
          <Button asChild variant="dark">
            <Link
              to={
                pathname === '/payments'
                  ? '/dashboard'
                  : pathname === '/services'
                    ? '/pricing'
                    : '/get-started'
              }
            >
              {pathname === '/payments'
                ? 'Open my bookings'
                : pathname === '/services'
                  ? 'Explore services'
                  : 'Find my space'}
              <ArrowUpRight size={18} />
            </Link>
          </Button>
        </Reveal>
      </section>
      {pathname === '/studios' && (
        <section className="container live-artist-links">
          <Label>EXPLORE THE STUDIOS</Label>
          {studios.data?.studios.map((studio) => (
            <Link key={studio.id} to={'/studio/' + studio.slug}>
              <span>{studio.name}</span>
              <ArrowUpRight />
            </Link>
          ))}
        </section>
      )}
      <section className="container feature-card-grid">
        {[
          {
            icon: CalendarDays,
            title: 'Find your rhythm.',
            text: 'Set working hours and review requests. Confirmed appointments reserve the time.',
            path: '/booking',
          },
          {
            icon: MessageSquare,
            title: 'Keep the conversation.',
            text: 'Discuss each booking in its own private thread, with your reference images close by.',
            path: '/dashboard?tab=bookings',
          },
          {
            icon: Wallet,
            title: 'Know the next step.',
            text: 'Keep your agreed quote, deposit and payment records together.',
            path: '/payments',
          },
          {
            icon: Users,
            title: 'Bring the people together.',
            text: 'Invite artists and manage the services that make your studio yours.',
            path: '/register?role=studio',
          },
          {
            icon: PenTool,
            title: 'Make it your own.',
            text: 'Choose your artist page theme and publish artwork from your workspace.',
            path: '/artist-websites',
          },
        ].map((item) => (
          <Reveal key={item.title}>
            <Link className="feature-card" to={item.path}>
              <item.icon />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <ArrowUpRight size={18} />
            </Link>
          </Reveal>
        ))}
      </section>
      <ScrollStory />
      {pathname !== '/payments' && (
        <section className="container product-section">
          <Label>YOUR BOOKS, WITH A LITTLE MORE SPACE</Label>
          <h2>See what’s open.</h2>
          <StudioPanel />
        </section>
      )}
      <section className="container faq-section">
        <div>
          <Label>A LITTLE CLARITY</Label>
          <h2>Good questions.</h2>
        </div>
        <FAQs items={faqs.slice(0, 5)} />
      </section>
      <CTA />
    </>
  );
}
export function MobileApp() {
  return (
    <>
      <PageIntro
        label="YOUR VENUE, IN YOUR POCKET"
        title="Made to move with you."
        text="Your bookings, conversations and studio tools, wherever the day takes you."
      />
      <section className="container split detail-story">
        <Reveal>
          <Photo name="tattoo-arm-floral" alt="Close-up of floral tattoo artwork" />
        </Reveal>
        <Reveal>
          <Smartphone size={38} />
          <h2>
            Less tied
            <br />
            to the desk.
          </h2>
          <p>
            Open Venue in your mobile browser. Add it to your home screen for a direct route back to
            your workspace.
          </p>
          <h3>On iPhone or iPad</h3>
          <p>In Safari, open Share and choose Add to Home Screen.</p>
          <h3>On Android</h3>
          <p>Open your browser menu and choose Add to Home screen or Install app.</p>
          <p>Your account needs an internet connection to keep bookings and messages up to date.</p>
          <Button asChild variant="dark">
            <Link to="/dashboard">
              Open my workspace
              <ArrowUpRight size={18} />
            </Link>
          </Button>
        </Reveal>
      </section>
      <ScrollStory />
      <CTA />
    </>
  );
}
