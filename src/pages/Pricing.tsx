import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { CTA, FAQs, Label, PageIntro } from '../components/Primitives';
import { Failure, Loading } from '../components/AsyncState';
import { useApi, money } from '../lib/queries';
import type { Service } from '../lib/types';
import { faqs } from '../data/site';
export default function Pricing() {
  const query = useApi<{ services: Service[] }>('/services');
  const [category, setCategory] = useState('All services');
  const services = query.data?.services || [];
  return (
    <>
      <PageIntro
        label="LESS OVERHEAD. MORE HEADSPACE."
        title="Good art. Clear pricing."
        text="Explore services and discuss the details with your artist. Your booking keeps the agreed quote and payment records together."
      />
      <section className="container pricing-page">
        <div className="access-plan">
          <div>
            <Label>YOUR SPACE TO CREATE</Label>
            <h2>
              Platform access.
              <br />
              No subscription fee.
            </h2>
            <p>
              Create an account to manage your bookings. Artists and studios can publish their pages
              and services.
            </p>
            <Button asChild variant="dark">
              <Link to="/get-started">
                Find my space
                <ArrowUpRight size={18} />
              </Link>
            </Button>
          </div>
          <ul>
            {[
              'Booking requests and conversations',
              'Artist pages and artwork collections',
              'Studio calendars and availability',
              'Payment enquiries and received-payment records',
            ].map((text) => (
              <li key={text}>
                <Check size={18} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="section-heading">
          <div>
            <Label>THE WORK, PRICED BY THE STUDIO</Label>
            <h2>Find your next session.</h2>
          </div>
          <select
            aria-label="Filter services"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['All services', ...new Set(services.map((s) => s.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure message={query.error.message} retry={() => query.refetch()} />
        ) : (
          <div className="service-directory-grid">
            {services
              .filter((s) => category === 'All services' || s.category === category)
              .map((s) => (
                <article key={s.id}>
                  <small>
                    {s.studio_name} · {s.category}
                  </small>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <strong>{money(s.price_cents, s.currency)}</strong>
                  <span>
                    {s.duration_minutes} minutes
                    {s.deposit_cents > 0 ? ' · Deposit ' + money(s.deposit_cents, s.currency) : ''}
                  </span>
                  <Link className="arrow-link" to={'/booking?service=' + s.id}>
                    Discuss this service
                    <ArrowUpRight size={17} />
                  </Link>
                </article>
              ))}
          </div>
        )}
        <div className="faq-section">
          <div>
            <Label>THE DETAILS THAT MATTER</Label>
            <h2>Before you book.</h2>
          </div>
          <FAQs items={[faqs[1], faqs[2], faqs[5]]} />
        </div>
      </section>
      <CTA />
    </>
  );
}
