export const links = {
  signup: 'https://venue.ink/sign-up',
  login: 'https://venue.ink/login',
  instagram: 'https://www.instagram.com/venue.ink/',
  contact: 'help@venue.ink',
  app: 'https://www.venue.ink/info/mobile-app',
  store: 'https://venue.ink/store',
  terms: 'https://www.venue.ink/owners-and-artists-terms',
  clientTerms: 'https://www.venue.ink/client-terms',
  privacy: 'https://www.venue.ink/privacy-policy',
};
export const navFeatures = [
  {
    path: '/booking',
    label: 'Booking & scheduling',
    detail: 'Your books. On your terms.',
  },
  {
    path: '/flash',
    label: 'Flash collections',
    detail: 'Give your designs a home.',
  },
  {
    path: '/artist-websites',
    label: 'Artist websites',
    detail: 'A link that feels like you.',
  },
  {
    path: '/payments',
    label: 'Deposits & payments',
    detail: 'Less chasing. More creating.',
  },
  {
    path: '/features',
    label: 'Explore all features',
    detail: 'Meet your new studio assistant.',
  },
];
export const faqs = [
  {
    q: 'What is Venue?',
    a: 'Venue brings tattoo booking requests, scheduling, deposits and client conversations together. Artists manage their own work; studios can coordinate a team.',
  },
  {
    q: 'Do clients need to download an app?',
    a: 'No. Clients can use an artist or studio booking link in their browser. Artists can manage their business on web, iOS and Android.',
  },
  {
    q: 'How much does it cost?',
    a: 'Solo and Studio have no monthly subscription. The published Solo card fee is 10%, charged to clients by default. Solo Pro is $50 USD/month with 5% card fees. Studio Pro is $150 USD/month for up to five active artists. Always check the current official pricing before signing up.',
  },
  {
    q: 'Can I bring my existing calendar?',
    a: 'Venue advertises Google Calendar sync so existing appointments can inform availability. Set up and confirm the integration in your Venue account.',
  },
  {
    q: 'Can studios book services other than tattoos?',
    a: 'Yes. Venue lists permanent makeup, piercing, tattoo removal and tooth gems among services eligible studios can organize. Venue is the booking platform, not the treatment provider.',
  },
  {
    q: 'How are deposits processed?',
    a: 'Venue identifies Stripe as its payment processor. Real deposits, payment terms and payouts are handled in the official Venue product. This preview never collects card information.',
  },
  {
    q: 'Can I organize a flash day?',
    a: 'Venue supports event time slots and flash-day bookings. Configure artists and availability in the official product.',
  },
  {
    q: 'Is this connected to my Venue account?',
    a: 'This independently built redesign preview is not connected to Venue account data. Interactive examples use local demonstration state. Use the official Venue links for real bookings, accounts and payments.',
  },
];
export const articles = [
  {
    slug: 'members-only-tattoo-supplies',
    category: 'News',
    title: 'A new home for the tools of your trade.',
    originalTitle: 'Introducing Members Only: Tattoo Supplies for Venue Artists',
    image: 'tattoo-machine-flatlay',
    url: 'https://www.venue.ink/blog/members-only-tattoo-supplies',
    excerpt:
      'Venue introduces Members Only, a tattoo supply shop for eligible US artists using the platform.',
    body: 'Members Only brings tattoo supplies into the Venue ecosystem. The official announcement covers machines, cartridges, inks and everyday studio essentials. Access, member eligibility, current inventory and checkout remain with Venue’s existing shop.',
  },
  {
    slug: 'managing-books-across-multiple-studios-as-a-tattoo-artist',
    category: 'Artist life',
    title: 'Different studios. One set of books.',
    originalTitle: 'Managing Books Across Multiple Studios as a Tattoo Artist',
    image: 'studio-vintage',
    url: 'https://www.venue.ink/blog/managing-books-across-multiple-studios-as-a-tattoo-artist',
    excerpt:
      'A Venue guide to keeping bookings organized when your work takes you between studios.',
    body: 'Guest spots and resident work can make scheduling complicated. Venue’s guide explores managing books across multiple studios. Read the original for its complete advice and keep studio-specific booking requirements with each request.',
  },
  {
    slug: 'how-to-reduce-no-shows-at-your-tattoo-studio',
    category: 'Studio notes',
    title: 'Keep the appointment. Lose the chasing.',
    originalTitle: 'How to Reduce No-Shows at Your Tattoo Studio',
    image: 'tattoo-consultation',
    url: 'https://www.venue.ink/blog/how-to-reduce-no-shows-at-your-tattoo-studio',
    excerpt: 'Practical ideas from Venue on appointment communication and reducing no-shows.',
    body: 'Clear expectations help both artists and clients prepare for an appointment. Venue’s guide looks at how booking processes and communication can reduce missed appointments. See the original article for the full guidance.',
  },
  {
    slug: 'how-much-to-tip-tattoo-artist',
    category: 'Culture',
    title: 'A little appreciation goes a long way.',
    originalTitle: 'How Much to Tip a Tattoo Artist',
    image: 'tattoo-hands',
    url: 'https://www.venue.ink/blog/how-much-to-tip-tattoo-artist',
    excerpt: 'Venue’s perspective on tipping etiquette and showing appreciation for your artist.',
    body: 'Tipping customs vary by location and individual circumstances. Venue’s article discusses tattoo tipping etiquette. Read the original for the complete discussion; this preview does not prescribe a universal tipping policy.',
  },
];
export const routeInfo: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'More ink. Less admin.',
    description: 'Tattoo booking, flash and studio tools. Make room for the work you love.',
  },
  '/for-tattoo-artists': {
    title: 'For tattoo artists',
    description: 'Your craft, your clients, your booking system.',
  },
  '/studios': {
    title: 'For tattoo studios',
    description: 'Bring your artists, requests and calendars together.',
  },
  '/features': {
    title: 'A little less everything else',
    description: 'Explore tools for bookings, flash, chat, calendars and payments.',
  },
  '/booking': {
    title: 'Booking, on your terms',
    description: 'See how custom requests become organized appointments.',
  },
  '/flash': {
    title: 'Made to be inked',
    description: 'Explore the interactive flash collection showcase.',
  },
  '/artist-websites': {
    title: 'Your link. Your world.',
    description: 'Explore personal artist booking page themes.',
  },
  '/payments': {
    title: 'Great work deserves a smooth finish',
    description: 'Understand Venue deposits, card payments and published fees.',
  },
  '/pricing': {
    title: 'Good art. Clear pricing.',
    description: 'Compare verified Venue Solo, Studio, Solo Pro and Studio Pro pricing.',
  },
  '/info/mobile-app': {
    title: 'Your studio, to go',
    description: 'Manage Venue bookings on web, iOS and Android.',
  },
  '/services': {
    title: 'More room for your craft',
    description: 'Booking tools for tattooing, piercing, PMU and other studio services.',
  },
  '/about': {
    title: 'Built around the people who make art',
    description: 'Discover the purpose behind Venue’s booking platform.',
  },
  '/journal': {
    title: 'Notes from the studio',
    description: 'Explore original Venue articles and studio resources.',
  },
  '/help': {
    title: 'A little clarity',
    description: 'Answers about bookings, payments and the Venue platform.',
  },
  '/contact': {
    title: 'Talk to a human',
    description: 'Prepare an email enquiry for the verified Venue support team.',
  },
  '/get-started': {
    title: 'Make room for more ink',
    description: 'Choose your path into the official Venue product.',
  },
  '/demo': {
    title: 'Take the artist’s seat',
    description: 'Explore the interactive Venue workspace demonstration.',
  },
  '/workspace/login': {
    title: 'Preview workspace sign in',
    description: 'Sign in to this independent demonstration workspace.',
  },
  '/workspace/register': {
    title: 'Create a preview workspace',
    description: 'Create an account for this independent implementation.',
  },
};
export const plans = [
  {
    name: 'Solo',
    monthly: 0,
    rate: 0.1,
    description: 'Your craft. Your business.',
    features: [
      'Unlimited booking forms and services',
      'Flash collections and personal booking link',
      'Client chat and automatic messages',
      '10% card processing fee',
    ],
  },
  {
    name: 'Studio',
    monthly: 0,
    rate: null,
    description: 'Independent artists. Together.',
    features: [
      'Everything in Solo',
      'Studio booking link and request assignment',
      'Shared team calendar',
      'Individual artist accounts',
    ],
  },
  {
    name: 'Solo Pro',
    monthly: 50,
    rate: 0.05,
    description: 'A little more room to grow.',
    features: [
      'Everything in Solo',
      '5% card processing fee',
      'Billed monthly in USD',
      'Cancel any time',
    ],
  },
  {
    name: 'Studio Pro',
    monthly: 150,
    rate: 0.05,
    description: 'For your growing collective.',
    features: [
      'Everything in Studio',
      '5% card processing fee and automatic splits',
      'Up to 5 active residents or guests',
      'Additional active artists: $35/month',
    ],
  },
];
