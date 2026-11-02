import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowUpRight,
  Search,
  ArrowLeft,
  Copy,
  ExternalLink,
  Mail,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import {
  CTA,
  FAQs,
  Label,
  PageIntro,
  Photo,
  Reveal,
} from "../components/Primitives";
import { articles, faqs, links } from "../data/site";
import manifest from "../data/image-manifest.json";
import { StudioDemo } from "../features/demo/StudioDemo";
import { BookingWizard } from "../features/booking/BookingWizard";
export function Journal() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All notes");
  const filtered = articles.filter(
    (a) =>
      (category === "All notes" || a.category === category) &&
      (a.title + " " + a.originalTitle + " " + a.excerpt)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageIntro
        label="A LITTLE PERSPECTIVE"
        title="Notes from the studio."
        text="The business, the craft and the bits in between. A reading list from the original Venue journal."
      />
      <section className="container journal-page">
        <div className="gallery-controls">
          <div className="filter-list">
            {["All notes", ...new Set(articles.map((a) => a.category))].map(
              (c) => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search journal"
              placeholder="Find a good read"
            />
          </label>
        </div>
        <div className="journal-page-grid">
          {filtered.map((a, i) => (
            <Reveal key={a.slug}>
              <article className="journal-card">
                <Link to={`/journal/${a.slug}`}>
                  <div className="journal-image">
                    <Photo name={a.image} alt={a.originalTitle} />
                    <span className="journal-arrow">
                      <ArrowUpRight />
                    </span>
                  </div>
                  <small>
                    {a.category.toUpperCase()}
                    <span>0{i + 1}</span>
                  </small>
                  <h2>{a.title}</h2>
                  <p>{a.excerpt}</p>
                  <span className="arrow-link">
                    Read the overview <ArrowRight size={17} />
                  </span>
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <h2>No notes found.</h2>
            <Button
              onClick={() => {
                setSearch("");
                setCategory("All notes");
              }}
            >
              Show all notes
            </Button>
          </div>
        )}
      </section>
      <CTA />
    </>
  );
}
export function Article() {
  const { slug } = useParams();
  const article = articles.find((a) => a.slug === slug);
  if (!article) return <NotFound />;
  return (
    <>
      <section className="container article-header">
        <Link className="back-link" to="/journal">
          <ArrowLeft size={16} /> Back to the journal
        </Link>
        <Label>{article.category.toUpperCase()}</Label>
        <h1>{article.originalTitle}</h1>
        <p>{article.excerpt}</p>
        <span className="article-source">
          A reading note on the official Venue article. No invented author or
          publication date.
        </span>
      </section>
      <div className="container article-hero">
        <Photo name={article.image} alt={article.originalTitle} eager />
      </div>
      <article className="article-body">
        <Label>THE READING NOTE</Label>
        <h2>{article.title}</h2>
        <p>{article.body}</p>
        <p>
          This page is a short original overview. The complete article, its
          author details and any current business terms remain on Venue’s
          official journal.
        </p>
        <Button asChild variant="dark">
          <a href={article.url}>
            Read the full Venue article <ExternalLink size={17} />
          </a>
        </Button>
        <div className="article-share">
          <span>Pass it along.</span>
          <button
            className="arrow-link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(article.url);
                toast.success("Original article link copied");
              } catch {
                toast.error(
                  "Could not copy. Open the original article to share its URL.",
                );
              }
            }}
          >
            <Copy size={17} /> Copy original link
          </button>
        </div>
      </article>
      <section className="container related-articles">
        <Label>KEEP READING</Label>
        <h2>A little more perspective.</h2>
        <div className="journal-page-grid">
          {articles
            .filter((a) => a.slug !== slug)
            .slice(0, 2)
            .map((a) => (
              <article className="journal-card" key={a.slug}>
                <Link to={`/journal/${a.slug}`}>
                  <Photo name={a.image} alt={a.originalTitle} />
                  <h3>{a.title}</h3>
                </Link>
              </article>
            ))}
        </div>
      </section>
      <CTA />
    </>
  );
}
export function Help() {
  const [search, setSearch] = useState("");
  const filtered = faqs.filter((f) =>
    (f.q + " " + f.a).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageIntro
        label="GOOD QUESTIONS. STRAIGHT ANSWERS."
        title="A little clarity."
        text="Bookings, payments and your next step. Find an answer, then get back to the good stuff."
      />
      <section className="container help-page">
        <label className="search-field">
          <Search />
          <input
            aria-label="Search frequently asked questions"
            placeholder="What’s on your mind?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <FAQs items={filtered} />
        {!filtered.length && (
          <p>
            No answers match that search. Try “payments”, “studio” or{" "}
            <Link to="/contact">contact the team</Link>.
          </p>
        )}
        <div className="help-contact">
          <Mail />
          <h2>Better with a human?</h2>
          <p>Some things deserve a conversation.</p>
          <Button asChild variant="dark">
            <Link to="/contact">
              Talk to Venue <ArrowUpRight size={17} />
            </Link>
          </Button>
        </div>
      </section>
      <CTA />
    </>
  );
}
const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.email("Please enter a valid email"),
  type: z.enum([
    "Artist support",
    "Studio support",
    "Pricing & plans",
    "Something else",
  ]),
  studio: z.string().max(150),
  message: z
    .string()
    .trim()
    .min(15, "Tell us a little more (at least 15 characters)")
    .max(3000),
});
type ContactValues = z.infer<typeof contactSchema>;
export function Contact() {
  const [draft, setDraft] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { type: "Artist support", studio: "" },
  });
  return (
    <>
      <PageIntro
        label="REAL PEOPLE. REAL CONVERSATIONS."
        title="Talk to a human."
        text="A question about your books, your studio, or something in between? The Venue team is an email away."
      />
      <section className="container contact-grid">
        <Reveal>
          <Label>LET’S START HERE</Label>
          <h2>
            A little context
            <br />
            goes a long way.
          </h2>
          <p>
            This form prepares an email in your own mail app. Your message is
            sent only when you choose to send it there.
          </p>
          <a className="contact-email" href={`mailto:${links.contact}`}>
            {links.contact} <ArrowUpRight size={20} />
          </a>
          <p className="fine-print">
            Support address verified in Venue’s official artist terms. This
            preview has no email delivery provider configured.
          </p>
          <Photo
            name="tools-workstation"
            alt="Tattoo tools carefully arranged in a studio"
          />
        </Reveal>
        <form
          className="contact-form"
          onSubmit={handleSubmit((v) => {
            const body = `Name: ${v.name}\nReply email: ${v.email}\nStudio: ${v.studio || "Not specified"}\n\n${v.message}`;
            setDraft(
              `mailto:${links.contact}?subject=${encodeURIComponent(v.type + " enquiry")}&body=${encodeURIComponent(body)}`,
            );
            toast("Email draft prepared. Open your mail app to send it.");
          })}
        >
          <div className="form-grid">
            <label>
              Your name
              <input
                {...register("name")}
                autoComplete="name"
                aria-invalid={!!errors.name}
                aria-describedby="contact-name-error"
              />
              {errors.name && (
                <span className="field-error" id="contact-name-error">
                  {errors.name.message}
                </span>
              )}
            </label>
            <label>
              Email address
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby="contact-email-error"
              />
              {errors.email && (
                <span className="field-error" id="contact-email-error">
                  {errors.email.message}
                </span>
              )}
            </label>
          </div>
          <label>
            What’s it about?
            <select {...register("type")}>
              {[
                "Artist support",
                "Studio support",
                "Pricing & plans",
                "Something else",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Studio or artist name <small>(optional)</small>
            <input {...register("studio")} autoComplete="organization" />
          </label>
          <label>
            A little about your question
            <textarea
              {...register("message")}
              rows={6}
              aria-invalid={!!errors.message}
              aria-describedby="contact-message-error"
              placeholder="Give us the details…"
            />
            {errors.message && (
              <span className="field-error" id="contact-message-error">
                {errors.message.message}
              </span>
            )}
          </label>
          <p className="fine-print">
            Please don’t include payment details, private client records or
            medical information.
          </p>
          <Button type="submit" variant="dark">
            Prepare my email <ArrowUpRight size={18} />
          </Button>
          {draft && (
            <div className="email-ready" role="status">
              <Mail />
              <div>
                <strong>Your draft is ready.</strong>
                <p>No message has been sent.</p>
                <a href={draft}>Open in my email app ↗</a>
              </div>
            </div>
          )}
        </form>
      </section>
      <CTA />
    </>
  );
}
export function GetStarted() {
  return (
    <>
      <PageIntro
        label="A LITTLE MORE SPACE STARTS HERE"
        title="Find your Venue."
        text="For your books, your creative collective, or your next idea. Choose where you want to go."
      />
      <section className="container onboarding-grid">
        {[
          {
            title: "I’m an artist.",
            description: "Give your books a home and your work some headspace.",
            photo: "artist-portrait-man",
            url: links.signup,
            cta: "Set up with Venue",
          },
          {
            title: "I run a studio.",
            description: "Bring your people, calendars and requests together.",
            photo: "studio-interior",
            url: links.signup,
            cta: "Start a studio account",
          },
          {
            title: "I’m just exploring.",
            description:
              "Try the calendar and booking example. No account needed.",
            photo: "studio-community",
            url: "/demo",
            cta: "Take a look around",
          },
        ].map((item, i) => (
          <Reveal className="onboarding-card" delay={i * 0.1} key={item.title}>
            <Photo name={item.photo} alt={item.description} />
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <Button asChild variant="dark">
                {item.url.startsWith("/") ? (
                  <Link to={item.url}>
                    {item.cta}
                    <ArrowUpRight size={17} />
                  </Link>
                ) : (
                  <a href={item.url}>
                    {item.cta}
                    <ArrowUpRight size={17} />
                  </a>
                )}
              </Button>
            </div>
          </Reveal>
        ))}
      </section>
      <p className="container fine-print onboarding-note">
        Real accounts open the official Venue sign-up. This independent redesign
        does not connect to existing Venue credentials.
      </p>
      <CTA title="A little less waiting. A lot more creating." />
    </>
  );
}
export function Demo() {
  const [booking, setBooking] = useState(false);
  return (
    <>
      <PageIntro
        label="A LITTLE HANDS-ON"
        title="Take the artist’s seat."
        text="Create an example request, approve it, explore the calendar and try a conversation. Everything stays in your browser."
      />
      <section className="container full-demo">
        <div className="demo-page-controls">
          <p>
            Illustrative artists and requests. No messages, appointments or
            payments leave this demo.
          </p>
          <Button variant="dark" onClick={() => setBooking(true)}>
            Create an example booking <ArrowUpRight size={17} />
          </Button>
        </div>
        <StudioDemo />
        <div className="demo-next">
          <h2>Ready for your real books?</h2>
          <Button asChild>
            <a href={links.signup}>
              Open the official Venue app <ArrowUpRight size={18} />
            </a>
          </Button>
        </div>
      </section>
      <BookingWizard open={booking} onOpenChange={setBooking} />
    </>
  );
}
export function Credits() {
  return (
    <>
      <PageIntro
        label="THE PEOPLE BEHIND THE PICTURES"
        title="Real work. Real credit."
        text="Photography gives this experience its character. These images are licensed from Pexels and used as editorial stock, with no implied Venue affiliation."
      />
      <section className="container credits-grid">
        {manifest.map((item) => (
          <article key={item.id}>
            <Photo name={item.filename.replace(".webp", "")} alt={item.alt} />
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
export function NotFound() {
  return (
    <section className="not-found container">
      <Label>THIS PAGE WENT OFF SCRIPT</Label>
      <span className="error-number">
        404<span>✳</span>
      </span>
      <h1>
        A little lost?
        <br />
        Let’s get you back.
      </h1>
      <p>
        The page you’re looking for isn’t here. Your next good idea might be.
      </p>
      <Button asChild variant="dark">
        <Link to="/">
          Back to Venue <ArrowUpRight size={19} />
        </Link>
      </Button>
    </section>
  );
}
