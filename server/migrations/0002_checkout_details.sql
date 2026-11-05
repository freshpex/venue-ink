ALTER TABLE venue_app.settings ALTER COLUMN payment_email SET DEFAULT 'carlytatts@gmail.com';
UPDATE venue_app.settings SET payment_email='carlytatts@gmail.com',updated_at=now() WHERE id='site';
--> statement-breakpoint
UPDATE venue_app.articles SET body=replace(body,
'Choose the payment method that suits the arrangement and continue by email. The email contains your booking reference and payment selection so that the team can coordinate the next step. Opening an email does not transfer funds.',
'Choose the payment method that suits your booking. Keep your appointment details and agreed quote together so you can focus on the artwork ahead.')
WHERE slug='understanding-your-booking-and-payment';
