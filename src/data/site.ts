export const links = { signup: '/register', login: '/login', contact: '/contact', app: '/info/mobile-app', store: '/services', terms: '/terms', clientTerms: '/booking-terms', privacy: '/privacy' };
export const navFeatures = [
 {path:'/booking',label:'Booking & scheduling',detail:'Your books. On your terms.'},
 {path:'/flash',label:'Flash collections',detail:'Give your designs a home.'},
 {path:'/artist-websites',label:'Artist websites',detail:'A link that feels like you.'},
 {path:'/payments',label:'Payments',detail:'Coordinate the practical details.'},
 {path:'/features',label:'Explore all features',detail:'Meet your studio workspace.'}
];
export const faqs = [
 {q:'What is Venue?',a:'Venue brings tattoo booking requests, studio calendars, artwork and client conversations together. Artists manage their work, studios coordinate their team and clients keep their appointments in one account.'},
 {q:'Do I need to download an app?',a:'No. Venue works in your browser on phones, tablets and computers. You can also add it to your home screen for quick access.'},
 {q:'How much does it cost?',a:'Creating an account does not require a platform subscription. Individual services are priced by the artist or studio. Published prices appear in the service catalogue; custom work is quoted after your request is reviewed.'},
 {q:'How do I choose an appointment?',a:'Select an artist and service, then choose from their available times. Your request is sent to the artist for review. Your account shows when it has been confirmed.'},
 {q:'Can studios organize other services?',a:'Studios can create services for tattooing, piercing, permanent makeup, tattoo removal and tooth gems. Each studio is responsible for the services it publishes and the procedures it provides.'},
 {q:'How do payments work?',a:'Choose your payment method at checkout and continue by email. Your booking reference, selected method and payment details are filled in for you. The studio records a payment as received after verifying it.'},
 {q:'Can I book a flash day?',a:'Published studio events appear on the events page. Choose an available appointment for the event and send your request to the artist.'},
 {q:'Where can I find my requests and messages?',a:'Sign in to your workspace to see your booking status, speak with your artist, review payment requests and follow support enquiries.'}
];
export const routeInfo:Record<string,{title:string;description:string}> = Object.fromEntries([
 ['/', 'More ink. Less admin.', 'Make room for the work you love. Tattoo booking, calendars, artwork and conversations, together.'],
 ['/for-tattoo-artists','For tattoo artists','Your craft, your clients and your own booking space.'],
 ['/studios','For tattoo studios','Bring artists, booking requests and calendars together.'],
 ['/features','Your studio, connected','Explore booking, artwork, messages and studio management.'],
 ['/booking','Booking, on your terms','Find an artist and request your next appointment.'],
 ['/flash','Made to be inked','Discover artwork published by Venue artists.'],
 ['/artist-websites','Your link. Your world.','Create a personal artist page and share your work.'],
 ['/payments','Keep the details together','Choose a payment method and coordinate by email.'],
 ['/pricing','Clear prices. Good conversations.','Explore service prices and request a quote for custom work.'],
 ['/info/mobile-app','Your studio, to go','Bring Venue to your home screen.'],
 ['/services','Room for your craft','Explore services offered by our studios.'],
 ['/about','Made around the art','A space for the people behind the work.'],
 ['/journal','Notes from the studio','Ideas, practical guidance and perspectives on studio life.'],
 ['/help','Good questions. Straight answers.','Help with bookings, your account and payments.'],
 ['/contact','Talk to us','Send a support enquiry to the Venue team.'],
 ['/get-started','Find your Venue','Create your account as a client, artist or studio.'],
 ['/artists','Find your creative fit','Meet artists and explore their work.'],
 ['/events','Good days for good work','Explore upcoming studio events and flash days.'],
 ['/login','Welcome back','Sign in to your Venue account.'],
 ['/register','A fresh canvas','Create your Venue account.'],
 ['/dashboard','Your workspace','Manage bookings, messages, artwork and your account.'],
 ['/admin','Studio control','Manage the Venue platform.']
].map(([path,title,description])=>[path,{title,description}]));
