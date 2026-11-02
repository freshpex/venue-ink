# Standalone platform implementation

User scope: standalone authentication and admin, Neon PostgreSQL migrations and seed, all customer journeys connected to the backend, no obsolete upstream links or demonstration copy, stronger touch/drag/scroll interactions, no star/sparkle graphics.

The database URL is read from the ignored local `.env`; connection values must never be printed, committed or placed in frontend variables. The requested administrator is seeded with a bcrypt hash. Seed scripts must be idempotent and must not reset existing passwords on ordinary application restarts.

Work in progress: inspect database, build versioned migrations, seed system configuration/admin and actual content, replace frontend state with API flows, verify ownership/role boundaries, exercise customer and admin journeys against the database, complete responsive/motion QA and deployment configuration.
