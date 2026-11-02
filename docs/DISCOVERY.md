# Standalone Venue platform

The implementation is an independently owned artist and studio booking platform. Public navigation, authentication, artwork, services, appointments, messages, payments, support and administration use this codebase's own Node API.

Neon PostgreSQL records are isolated in the `venue_app` schema. Existing unrelated database schemas and tables are not migrated or seeded. Drizzle tracks migrations within the application schema. Initial setup creates the configured administrator, Venue Studio, six consultation/custom services, working hours and four original journal articles. It does not invent client appointments, payment receipts, testimonials or artist identities.

Payment checkout records an enquiry and opens the client's email application with the chosen method and appointment details addressed to `payment@venue.com`. Administrators and authorized studio staff record verified receipt; an email enquiry is never treated as paid.

The visual system uses bone, ink, lime and lavender, local display/body fonts, licensed photography, coordinated route and image reveals, draggable process cards, touch feedback and a mobile booking action. Reduced motion is respected.
