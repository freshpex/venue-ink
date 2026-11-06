import { z } from 'zod';
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, result.error.issues[0]?.message || 'Check the supplied information.');
  return result.data;
}
export const id = z.uuid('Invalid record identifier');
export const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z.string().min(8, 'Use at least 8 characters').max(128);
export const timezone = z
  .string()
  .max(70)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid time zone');
export const roles = ['admin', 'studio', 'artist', 'client'];
export const registration = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    password,
    role: z.enum(['client', 'artist', 'studio']).default('client'),
    invitation: z.string().max(150).optional(),
  })
  .strict();
export const login = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const bookingInput = z
  .object({
    artistId: id,
    serviceId: id,
    flashId: id.nullable().optional(),
    eventId: id.nullable().optional(),
    title: z.string().trim().min(3).max(160),
    notes: z.string().trim().max(3000).default(''),
    placement: z.string().max(100).default(''),
    sizeNote: z.string().max(100).default(''),
    startsAt: z.iso.datetime({ offset: true }),
    assetIds: z.array(id).max(3).default([]),
    idempotencyKey: z.string().min(16).max(100),
    consent: z.literal(true, { error: 'Please agree to the booking terms.' }),
  })
  .strict();
export const serviceInput = z
  .object({
    artistId: id.nullable().optional(),
    studioId: id,
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(1500).default(''),
    category: z.string().trim().min(2).max(60),
    durationMinutes: z.number().int().min(15).max(480),
    priceCents: z.number().int().min(0).max(100000000).nullable(),
    depositCents: z.number().int().min(0).max(100000000).default(0),
    active: z.boolean().default(true),
  })
  .strict();
export const articleInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(150),
    title: z.string().trim().min(5).max(200),
    category: z.string().trim().min(2).max(60),
    excerpt: z.string().trim().min(10).max(500),
    body: z.string().trim().min(30).max(30000),
    imageName: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    authorName: z.string().trim().min(2).max(100),
    published: z.boolean(),
  })
  .strict();
