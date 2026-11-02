# Venue discovery and implementation audit

Reviewed November 2, 2026. The supplied workspace was empty; there was no original application, backend configuration, account integration or commerce repository to preserve.

## Verified business architecture

- [Homepage](https://www.venue.ink/): artist booking forms, flash, personalized links, request review, chat, calendars, reminders, deposits and full payments.
- [Artists](https://www.venue.ink/for-tattoo-artists): independent artist booking and payments, Stripe, forms, profiles and client communication.
- [Studios](https://www.venue.ink/studios): multi-artist calendars, guest/resident intake, request assignment, payout splits and additional services. Piercing, PMU, tattoo removal and tooth gems are listed; Venue is not the treatment provider.
- [Pricing](https://www.venue.ink/pricing): Solo $0/month, 10% card fees; Studio $0/month; Solo Pro $50 USD/month with 5%; Studio Pro $150 USD/month with 5%, five active residents/guests, $35 per additional active artist. Fees charged to clients by default where stated. No fabricated annual discount.
- Fee conflict: the Studio feature page says 5%, while the current pricing page places reduced fees under Pro. Base Studio rate is deliberately not inferred. Pricing estimator covers only explicitly published rates and explains assumptions.
- [Book Smarter](https://www.venue.ink/book-smarter): events, Google Calendar sync, reminders and client booking in a browser.
- [Mobile app](https://www.venue.ink/info/mobile-app): web, iOS and Android; no app required for clients.
- [Members Only announcement](https://www.venue.ink/blog/members-only-tattoo-supplies): an existing supply shop for eligible US artists. Its [store](https://venue.ink/store) is retained as an external destination; no replacement cart or inventory.
- Official [sign-up](https://venue.ink/sign-up), [login](https://venue.ink/login), [Instagram](https://www.instagram.com/venue.ink/), [artist terms](https://www.venue.ink/owners-and-artists-terms), [client terms](https://www.venue.ink/client-terms), [privacy](https://www.venue.ink/privacy-policy) and help@venue.ink are verified public destinations. App downloads route through the official app page rather than inventing store IDs.

## Opportunities and approach

The reference explains individual features well but repeats screenshot/feature blocks and has conflicting public fee language. The redesign uses an editorial photographic rhythm, a single clear route into the real product, hands-on demonstrations and transparent pricing assumptions. Bone, ink, acid lime and lavender form the token system. Condensed display type contrasts with readable interface text. Real photography is locally optimized, credited stock; no stock model is presented as a verified Venue member.

Motion includes staggered clipped hero lines, a masked photo entrance, scroll-linked photography, a rolling typographic band, viewport reveals, route transitions, interactive panel transitions, image crops/zoom, theme changes, animated drawers and dialogs, and spring/press feedback. Reduced-motion preferences are respected. Heavy scroll hijacking and redundant animation libraries are avoided.

## Trust boundaries

Booking requests, team calendars, approvals and messages in the public demo are local illustrative state. Contact creates a mailto draft, not a sent message. No cards, health data or production client data are collected. Real account, booking, payment and supply actions open official Venue destinations. Testimonials and metrics were not copied into new endorsements without confirmed reuse authorization. Journal pages are original reading notes linking to genuine articles, not unauthorized full reproductions.

The separate preview workspace is a real Node/PostgreSQL implementation for private idea titles. It is explicitly independent of Venue authentication and has no claim to Venue production records. Integration with Venue’s private services requires authorization, API contracts, credentials, webhooks and security review.

Public SEO artifacts have route titles, descriptions, canonical and social tags, static readable fallbacks, sitemap and robots. The concept stays `noindex` to avoid impersonating or competing with the real site. Full production prerendering, official structured business data and indexability require an authorized production domain and final content approval.
