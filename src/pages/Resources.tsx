import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Copy, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { CTA, FAQs, Label, PageIntro, Photo, Reveal } from '../components/Primitives';
import { Empty, Failure, Loading } from '../components/AsyncState';
import { useApi, useRefresh, useSession } from '../lib/queries';
import { request } from '../lib/api';
import type { ArticleData } from '../lib/types';
import { faqs } from '../data/site';
import manifest from '../data/image-manifest.json';
export function Journal() {
  const query = useApi<{ articles: ArticleData[] }>('/articles');
  const [search, setSearch] = useState('');
  const filtered = (query.data?.articles || []).filter((a) =>
    (a.title + ' ' + a.excerpt).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageIntro
        label="A LITTLE PERSPECTIVE"
        title="Notes from the studio."
        text="The business, the craft and the bits in between. Practical reading for your next chapter."
      />
      <section className="container journal-page">
        <label className="search-field">
          <input
            aria-label="Search journal"
            placeholder="Find a good read"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure message={query.error.message} retry={() => query.refetch()} />
        ) : (
          <div className="journal-page-grid">
            {filtered.map((a) => (
              <Reveal key={a.id}>
                <article className="journal-card">
                  <Link to={'/journal/' + a.slug}>
                    <div className="journal-image">
                      <Photo name={a.image_name} alt={a.title} />
                      <span className="journal-arrow">
                        <ArrowUpRight />
                      </span>
                    </div>
                    <small>{a.category}</small>
                    <h2>{a.title}</h2>
                    <p>{a.excerpt}</p>
                    <span className="arrow-link">
                      Read the story
                      <ArrowUpRight size={17} />
                    </span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        )}
        {!query.isPending && !query.isError && !filtered.length && (
          <Empty title="No notes found." text="Try another subject or clear your search." />
        )}
      </section>
      <CTA />
    </>
  );
}
export function Article() {
  const { slug } = useParams();
  const query = useApi<{ article: ArticleData }>('/articles/' + slug);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const a = query.data.article;
  return (
    <>
      <section className="container article-header">
        <Link className="back-link" to="/journal">
          <ArrowLeft size={16} />
          Back to the journal
        </Link>
        <Label>{a.category}</Label>
        <h1>{a.title}</h1>
        <p>{a.excerpt}</p>
        <span className="article-source">
          {a.author_name} ·{' '}
          {new Date(a.published_at).toLocaleDateString('en-US', { dateStyle: 'long' })}
        </span>
      </section>
      <div className="container article-hero">
        <Photo name={a.image_name} alt={a.title} eager />
      </div>
      <article className="article-body">
        {a.body
          ?.split('\n\n')
          .map((paragraph, index) =>
            paragraph.startsWith('## ') ? (
              <h2 key={index}>{paragraph.slice(3)}</h2>
            ) : (
              <p key={index}>{paragraph}</p>
            ),
          )}
        <button
          className="arrow-link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              toast.success('Article link copied');
            } catch {
              toast.error('Copy is unavailable');
            }
          }}
        >
          <Copy size={17} />
          Share this story
        </button>
      </article>
      <CTA />
    </>
  );
}
export function Help() {
  const [search, setSearch] = useState('');
  return (
    <>
      <PageIntro
        label="HERE TO HELP"
        title="A little clarity."
        text="Find your way around booking, your account and the studio workspace."
      />
      <section className="container help-page">
        <label className="search-field">
          <input
            aria-label="Search help"
            placeholder="What would you like to know?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <FAQs
          items={faqs.filter((f) => (f.q + f.a).toLowerCase().includes(search.toLowerCase()))}
        />
        <Button asChild variant="dark">
          <Link to="/contact">
            Talk to us
            <ArrowUpRight size={17} />
          </Link>
        </Button>
      </section>
    </>
  );
}
export function Contact() {
  const session = useSession();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <PageIntro
        label="LET’S TALK"
        title="Good things start with a hello."
        text="A question about your account, your studio or your next booking? Send it our way."
      />
      <section className="container contact-layout">
        <Reveal>
          <Photo name="studio-vintage" alt="Tattoo studio interior" />
          <h2>A place for the conversation.</h2>
          <p>
            Booking-specific questions stay with your appointment in the workspace. For everything
            else, reach the Venue team here.
          </p>
          <Link className="arrow-link" to="/dashboard">
            Open my workspace
            <ArrowUpRight size={17} />
          </Link>
        </Reveal>
        {reference ? (
          <div className="contact-success" role="status">
            <CheckCircle size={40} />
            <h2>We have your message.</h2>
            <p>
              Your reference is <strong>{reference}</strong>.
            </p>
            <p>
              {session.data
                ? 'Track the response in the Support section of your workspace.'
                : 'Keep your reference. Sign in before sending future messages to follow their replies in your workspace.'}
            </p>
            <Button onClick={() => setReference('')}>Send another message</Button>
          </div>
        ) : (
          <form
            className="platform-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                const result = await request<{ request: { reference: string } }>('/contact', {
                  method: 'POST',
                  body: JSON.stringify(Object.fromEntries(form)),
                });
                setReference(result.request.reference);
                refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={session.data?.name}
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                defaultValue={session.data?.email}
              />
            </label>
            <label>
              What’s on your mind?
              <select name="category" aria-label="What’s on your mind?">
                <option>General enquiry</option>
                <option>Account support</option>
                <option>Studio setup</option>
                <option>Booking question</option>
                <option>Payment enquiry</option>
                <option>Privacy request</option>
              </select>
            </label>
            <label>
              Studio name (optional)
              <input name="studioName" maxLength={150} />
            </label>
            <label>
              Your message
              <textarea name="message" required minLength={15} maxLength={3000} rows={6} />
            </label>
            <p>
              By sending, you agree that Venue can use these details to respond.{' '}
              <Link to="/privacy">Privacy notice</Link>
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button variant="dark" disabled={busy}>
              {busy ? 'Sending your message…' : 'Send my message'}
              <ArrowUpRight size={17} />
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
export function GetStarted() {
  return (
    <>
      <PageIntro
        label="FIND YOUR SPACE"
        title="A Venue for your next chapter."
        text="Choose the way you work. Your account keeps the practical details together."
      />
      <section className="container role-grid">
        {[
          {
            role: 'client',
            title: 'I’m here for the art.',
            text: 'Find an artist, share your idea and follow your appointments.',
            image: 'tattoo-hands',
          },
          {
            role: 'artist',
            title: 'I make my own mark.',
            text: 'Publish your artist page, open your books and manage your work.',
            image: 'artist-studio-portrait',
          },
          {
            role: 'studio',
            title: 'We create together.',
            text: 'Manage studio services, invite artists and see the team’s calendar.',
            image: 'studio-community',
          },
        ].map((item) => (
          <Reveal key={item.role}>
            <Link to={'/register?role=' + item.role} className="role-card">
              <Photo name={item.image} alt={item.title} />
              <div>
                <h2>{item.title}</h2>
                <p>{item.text}</p>
                <span className="arrow-link">
                  Create my account
                  <ArrowUpRight />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </section>
      <p className="container centered">
        Already have your space? <Link to="/login">Sign in to Venue.</Link>
      </p>
    </>
  );
}
export function Credits() {
  return (
    <>
      <PageIntro
        label="THE PEOPLE BEHIND THE PICTURES"
        title="Real work. Real credit."
        text="Photography gives this experience its character. These images are licensed from Pexels and used as editorial photography, with no implied artist affiliation."
      />
      <section className="container credits-grid">
        {manifest.map((item) => (
          <article key={item.id}>
            <Photo name={item.id} alt={item.alt} />
            <h2>{item.photographer}</h2>
            <p>{item.alt}</p>
            <div>
              <a href={item.sourcePage} target="_blank" rel="noreferrer">
                Original photograph ↗
              </a>
              <a href={item.licenseUrl} target="_blank" rel="noreferrer">
                Pexels license ↗
              </a>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
export function Legal() {
  const { pathname } = useLocation();
  const privacy = pathname === '/privacy';
  const booking = pathname === '/booking-terms';
  return (
    <>
      <PageIntro
        label="THE DETAILS, IN PLAIN ENGLISH"
        title={
          privacy
            ? 'Your information. Your trust.'
            : booking
              ? 'Before your appointment.'
              : 'Using your Venue.'
        }
        text="The practical details for using this platform."
      />
      <article className="article-body">
        {privacy ? (
          <>
            <h2>Information stored</h2>
            <p>
              Your account name, email, protected password, booking details, reference images,
              messages, payment enquiries and support requests are stored to provide the service.
              Account cookies keep you signed in. This site uses local fonts and does not add
              advertising trackers.
            </p>
            <h2>Access and requests</h2>
            <p>
              Your artist, studio and administrators can access information needed to manage your
              appointment. Uploaded artist artwork and profile images become public when published.
              Contact support to request access, correction or deletion; records needed for a
              dispute or payment may need to be retained.
            </p>
            <h2>Email enquiries</h2>
            <p>
              The optional live support widget is provided by Tawk.to. It may process your IP
              address, browser information, page visits and messages, and use cookies to maintain a
              support conversation. Share only the details needed for your enquiry. You can also
              contact Venue through the platform’s support form.
            </p>
            <p>
              When you contact us, your chosen communication service may process your message. Share
              only the details needed for your enquiry.
            </p>
          </>
        ) : (
          <>
            <h2>{booking ? 'A request comes first' : 'Your account and content'}</h2>
            <p>
              {booking
                ? 'Sending a request does not confirm an appointment. Your artist reviews the idea, time and scope before confirming. Pending requests can share a time; confirmed appointments reserve it.'
                : 'Use accurate contact details, keep your password private and upload only material you have permission to use. Artists and studios are responsible for their published services, availability and artwork.'}
            </p>
            <h2>Quotes and payments</h2>
            <p>
              A service or artwork may require an individual quote. Your booking shows the quote and
              deposit when set by the artist. Review the agreed amount before proceeding. A received
              payment is recorded only after verification.
            </p>
            <h2>Changes and cancellation</h2>
            <p>
              Use your booking conversation to discuss changes, preparation and artist-specific
              cancellation or deposit conditions before paying. You can cancel an open request in
              your workspace. Cancelling does not automatically refund money; contact the studio
              about payments already received.
            </p>
            <h2>Before attending</h2>
            <p>
              Confirm age requirements, suitability, identification, preparation and aftercare
              directly with your artist.
            </p>
          </>
        )}
        <Link className="arrow-link" to="/contact">
          Contact Venue
          <ArrowUpRight size={17} />
        </Link>
      </article>
    </>
  );
}
export function NotFound() {
  return (
    <section className="not-found container">
      <Label>THIS PAGE WENT OFF SCRIPT</Label>
      <span className="error-number">404</span>
      <h1>
        A little lost?
        <br />
        Let’s get you back.
      </h1>
      <Button asChild variant="dark">
        <Link to="/">
          Back to Venue
          <ArrowUpRight size={19} />
        </Link>
      </Button>
    </section>
  );
}
