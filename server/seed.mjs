import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { editorial } from './content.mjs';
import { transaction } from './db.mjs';
export async function seedDatabase(
  pool,
  { email = process.env.SEED_ADMIN_EMAIL, password = process.env.SEED_ADMIN_PASSWORD } = {},
) {
  return transaction(pool, async (db) => {
    await db.query("INSERT INTO venue_app.settings(id) VALUES('site') ON CONFLICT DO NOTHING");
    let admin = (
      await db.query('SELECT id,role FROM venue_app.users WHERE email=$1', [
        (email || 'admin@venue.com').toLowerCase(),
      ])
    ).rows[0];
    const adminCreated=!admin;
    if (!admin) {
      if (!email || !password)
        throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for initial setup');
      const id = randomUUID();
      const hash = await bcrypt.hash(password, 12);
      admin = (
        await db.query(
          "INSERT INTO venue_app.users(id,email,name,password_hash,role) VALUES($1,$2,'Venue Administrator',$3,'admin') RETURNING id,role",
          [id, email.toLowerCase(), hash],
        )
      ).rows[0];
    }
    if (admin.role !== 'admin')
      throw new Error('The configured administrator email already belongs to another account');
    let studio = (await db.query("SELECT id FROM venue_app.studios WHERE slug='venue-studio'"))
      .rows[0];
    const studioCreated=!studio;
    if (!studio)
      studio = (
        await db.query(
          "INSERT INTO venue_app.studios(id,owner_id,name,slug,bio,timezone) VALUES($1,$2,'Venue Studio','venue-studio','A home for custom tattoo requests and creative conversations.','Europe/Amsterdam') RETURNING id",
          [randomUUID(), admin.id],
        )
      ).rows[0];
    await db.query(
      "INSERT INTO venue_app.artist_profiles(user_id,studio_id,slug,display_name,bio,styles,published) VALUES($1,$2,'venue-studio','Venue Studio','Share your idea with the studio. We will review the request and discuss the details with you.','[\"Custom tattoo\",\"Consultation\"]',true) ON CONFLICT(user_id) DO NOTHING",
      [admin.id, studio.id],
    );
    const count = Number(
      (await db.query('SELECT count(*) FROM venue_app.services WHERE studio_id=$1', [studio.id]))
        .rows[0].count,
    );
    if (!count) {
      for (const [name, category, duration, description] of [
        [
          'Custom tattoo',
          'Tattoo',
          120,
          'Tell us about the artwork you have in mind. Your artist will provide a quote after reviewing the request.',
        ],
        [
          'Tattoo consultation',
          'Tattoo',
          30,
          'Discuss a design, placement and the next steps with the studio.',
        ],
        [
          'Piercing consultation',
          'Piercing',
          30,
          'Ask about piercing options and arrange a consultation.',
        ],
        [
          'Permanent makeup consultation',
          'PMU',
          45,
          'Discuss the permanent makeup service you are considering.',
        ],
        [
          'Tattoo removal consultation',
          'Removal',
          30,
          'Discuss your tattoo removal enquiry with the studio.',
        ],
        [
          'Tooth gem consultation',
          'Tooth gems',
          30,
          'Talk through the tooth gem service you have in mind.',
        ],
      ])
        await db.query(
          'INSERT INTO venue_app.services(id,studio_id,name,description,category,duration_minutes) VALUES($1,$2,$3,$4,$5,$6)',
          [randomUUID(), studio.id, name, description, category, duration],
        );
    }
    for (const weekday of studioCreated?[1, 2, 3, 4, 5, 6]:[])
      await db.query(
        'INSERT INTO venue_app.availability(id,artist_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5) ON CONFLICT(artist_id,weekday) DO NOTHING',
        [randomUUID(), admin.id, weekday, '10:00', weekday === 6 ? '16:00' : '18:00'],
      );
    for (const article of editorial)
      await db.query(
        'INSERT INTO venue_app.articles(id,slug,title,category,excerpt,body,image_name,author_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(slug) DO NOTHING',
        [
          randomUUID(),
          article.slug,
          article.title,
          article.category,
          article.excerpt,
          article.body,
          article.image,
          'Venue Editorial',
        ],
      );
    return { adminCreated, studioId: studio.id, articles: editorial.length };
  });
}
