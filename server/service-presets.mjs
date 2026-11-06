import { z } from 'zod';
import { serviceInput } from './validation.mjs';

export const presetInput = serviceInput
  .omit({ studioId: true, artistId: true })
  .extend({
    key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  })
  .refine(
    (service) => service.priceCents === null || service.depositCents <= service.priceCents,
    'A deposit cannot exceed the service price.',
  );
export const presetMenuInput = z
  .object({
    services: z
      .array(presetInput)
      .min(1)
      .max(40)
      .refine(
        (services) =>
          new Set(services.map((s) => s.key)).size === services.length &&
          new Set(services.map((s) => s.name.trim().toLowerCase())).size === services.length,
        'Each service must have a different name and preset key.',
      ),
  })
  .strict();

const preset = (key, name, category, durationMinutes, priceCents, depositCents, description) => ({
  key,
  name,
  category,
  durationMinutes,
  priceCents,
  depositCents,
  description,
  active: true,
});
export const starterServices = [
  preset(
    'tattoo-consultation',
    'Tattoo consultation',
    'Tattoo',
    30,
    0,
    0,
    'Discuss your design, placement, size and budget before planning your tattoo. This consultation does not include tattooing.',
  ),
  preset(
    'small-fine-line',
    'Small fine-line tattoo',
    'Tattoo',
    60,
    15000,
    5000,
    'A simple fine-line design up to approximately 5 cm on a straightforward placement. Review the artwork with your artist before confirming the appointment.',
  ),
  preset(
    'medium-fine-line',
    'Medium fine-line tattoo',
    'Tattoo',
    120,
    30000,
    10000,
    'A fine-line design approximately 5–10 cm. Your artist will review detail, placement and the time needed before confirming the scope.',
  ),
  preset(
    'lettering',
    'Lettering tattoo',
    'Tattoo',
    60,
    15000,
    5000,
    'A short word, name or small phrase. Bring the exact spelling and discuss lettering style and placement with your artist.',
  ),
  preset(
    'blackwork',
    'Blackwork tattoo session',
    'Tattoo',
    120,
    30000,
    10000,
    'A two-hour session for bold blackwork, illustrative shading or geometric work. Larger projects may need additional appointments.',
  ),
  preset(
    'colour',
    'Colour tattoo session',
    'Tattoo',
    180,
    45000,
    15000,
    'A three-hour colour tattoo session. Discuss the palette, detail and placement with your artist when reviewing the design.',
  ),
  preset(
    'flash',
    'Flash tattoo session',
    'Tattoo',
    60,
    15000,
    5000,
    'A small design selected from this artist’s available flash. Confirm the design and size in your booking request; an individual flash listing can carry its own price.',
  ),
  preset(
    'half-day',
    'Custom tattoo half-day',
    'Tattoo',
    240,
    60000,
    20000,
    'Reserve a four-hour appointment for a custom tattoo project, including setup and breaks. Your artist will confirm what can be completed in the session.',
  ),
  preset(
    'full-day',
    'Custom tattoo full-day',
    'Tattoo',
    420,
    100000,
    30000,
    'Reserve a seven-hour appointment for a larger custom project, including setup and breaks. Multi-session work is planned with your artist in advance.',
  ),
  preset(
    'cover-up-consultation',
    'Cover-up consultation',
    'Tattoo',
    45,
    0,
    0,
    'Review the existing tattoo, photographs and possible cover-up directions. Tattooing is arranged in a separate appointment after the design is assessed.',
  ),
  preset(
    'cover-up-session',
    'Cover-up tattoo session',
    'Tattoo',
    180,
    50000,
    15000,
    'A three-hour cover-up session following a design consultation. Suitability and the agreed scope must be confirmed with the artist first.',
  ),
  preset(
    'touch-up',
    'Tattoo touch-up',
    'Tattoo',
    60,
    10000,
    2500,
    'A standalone touch-up appointment after the tattoo has healed. The artist reviews the work first; any complimentary touch-up policy is confirmed separately.',
  ),
  preset(
    'piercing-consultation',
    'Piercing consultation',
    'Piercing',
    30,
    0,
    0,
    'Discuss placement, jewellery and aftercare with a qualified practitioner. This consultation does not include piercing or jewellery.',
  ),
  preset(
    'pmu-consultation',
    'Permanent makeup consultation',
    'PMU',
    45,
    0,
    0,
    'Discuss your goals, suitability and the proposed permanent makeup service with a qualified practitioner. Treatment is arranged separately.',
  ),
  preset(
    'removal-consultation',
    'Tattoo removal consultation',
    'Removal',
    30,
    0,
    0,
    'Discuss the tattoo and possible removal options with a qualified practitioner. This consultation does not include removal treatment.',
  ),
  preset(
    'tooth-gem-consultation',
    'Tooth gem consultation',
    'Tooth gems',
    30,
    0,
    0,
    'Discuss gem options, suitability and care with the practitioner. Gems and application are priced and arranged separately.',
  ),
];
