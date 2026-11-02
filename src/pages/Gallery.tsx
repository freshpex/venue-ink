import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { CTA, Label, PageIntro, Photo, Reveal } from '../components/Primitives';
import { Empty, Failure, Loading } from '../components/AsyncState';
import { BookingWizard } from '../features/booking/BookingFlow';
import { useApi, useSession, useRefresh, assetUrl, money } from '../lib/queries';
import { request } from '../lib/api';
import type { FlashDesign } from '../lib/types';
export default function Gallery() {
  const [params] = useSearchParams();
  const query = useApi<{ designs: FlashDesign[] }>(
    '/flash' + (params.get('artist') ? '?artistId=' + params.get('artist') : ''),
  );
  const session = useSession();
  const saved = useApi<{ ids: string[] }>('/saved-designs', { enabled: !!session.data });
  const refresh = useRefresh();
  const [filter, setFilter] = useState('All work');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FlashDesign | null>(null);
  const [booking, setBooking] = useState<FlashDesign | null>(null);
  const [onlySaved, setOnlySaved] = useState(false);
  const designs = query.data?.designs || [];
  const items = designs.filter(
    (item) =>
      (filter === 'All work' || item.category === filter) &&
      (!onlySaved || saved.data?.ids.includes(item.id)) &&
      (item.title + ' ' + item.artist_name).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageIntro
        label="FROM IDEA TO INK"
        title="Made to be inked."
        text="Original flash, published by the artists. Find a piece that feels like yours and start the conversation."
      />
      <section className="container gallery-page">
        <div className="gallery-controls">
          <div className="filter-list">
            {['All work', ...new Set(designs.map((d) => d.category))].map((c) => (
              <button
                key={c}
                aria-pressed={filter === c}
                className={filter === c ? 'active' : ''}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
            {session.data && (
              <button aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}>
                <Heart size={15} />
                Saved work
              </button>
            )}
          </div>
          <label className="search-field">
            <input
              aria-label="Search gallery"
              placeholder="Find your next piece"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure message={query.error.message} retry={() => query.refetch()} />
        ) : !items.length ? (
          <Empty
            title="Room for the next great piece."
            text="No published artwork matches this collection yet. Start with a custom idea and find your artist."
            to="/artists"
            action="Find an artist"
          />
        ) : (
          <div className="gallery-masonry">
            {items.map((item) => (
              <Reveal className="gallery-item" key={item.id}>
                <button
                  className="gallery-image"
                  onClick={() => setSelected(item)}
                  aria-label={'View ' + item.title}
                >
                  <img src={assetUrl(item.image_url)} alt={item.title} loading="lazy" />
                  <span className="gallery-view">
                    <ArrowUpRight />
                  </span>
                </button>
                <div className="gallery-item-title">
                  <div>
                    <small>
                      {item.artist_name} · {item.category}
                    </small>
                    <h2>{item.title}</h2>
                    <span>{money(item.price_cents)}</span>
                  </div>
                  {session.data ? (
                    <button
                      className="icon-button"
                      aria-label={
                        (saved.data?.ids.includes(item.id) ? 'Unsave ' : 'Save ') + item.title
                      }
                      aria-pressed={!!saved.data?.ids.includes(item.id)}
                      onClick={async () => {
                        try {
                          await request('/saved-designs/' + item.id, {
                            method: 'PUT',
                            body: JSON.stringify({ saved: !saved.data?.ids.includes(item.id) }),
                          });
                          refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <Heart
                        size={21}
                        fill={saved.data?.ids.includes(item.id) ? 'currentColor' : 'none'}
                      />
                    </button>
                  ) : (
                    <Link
                      className="icon-button"
                      aria-label="Sign in to save artwork"
                      to="/login?next=/flash"
                    >
                      <Heart size={21} />
                    </Link>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </section>
      <section className="dark-story">
        <div className="container split">
          <Reveal>
            <Label light>YOUR FLASH. YOUR WAY.</Label>
            <h2>
              Keep the collection.
              <br />
              Lose the chaos.
            </h2>
            <p>
              Publish your original artwork, organize it by category and choose whether a piece can
              be repeated. Every request comes back to your workspace.
            </p>
            <Button asChild>
              <Link to={session.data ? '/dashboard?tab=artwork' : '/register?role=artist'}>
                Make room for my work
                <ArrowUpRight size={18} />
              </Link>
            </Button>
          </Reveal>
          <Photo name="neon-tattoo-tools" alt="Tattoo equipment in a colorful studio" />
        </div>
      </section>
      <Dialog.Root
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay lightbox-overlay" />
          <Dialog.Content className="lightbox">
            <Dialog.Close aria-label="Close image" className="icon-button lightbox-close">
              <X />
            </Dialog.Close>
            {selected && (
              <>
                <img src={assetUrl(selected.image_url)} alt={selected.title} />
                <div className="lightbox-caption">
                  <div>
                    <Dialog.Title>{selected.title}</Dialog.Title>
                    <Dialog.Description>
                      {selected.description} · {selected.artist_name}
                    </Dialog.Description>
                    <p>
                      {money(selected.price_cents)} · {selected.size_note} ·{' '}
                      {selected.placement_note}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setBooking(selected);
                      setSelected(null);
                    }}
                  >
                    Request this piece
                    <ArrowUpRight size={17} />
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <BookingWizard
        open={!!booking}
        onOpenChange={(v) => {
          if (!v) setBooking(null);
        }}
        artistId={booking?.artist_id}
        flashId={booking?.id}
        design={booking?.title}
      />
      <CTA />
    </>
  );
}
