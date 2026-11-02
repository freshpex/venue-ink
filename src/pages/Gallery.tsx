import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, Search, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { CTA, Label, PageIntro, Photo, Reveal } from '../components/Primitives';
import { BookingWizard } from '../features/booking/BookingWizard';
const collection = [
  {
    name: 'The botanical study',
    image: 'tattoo-floral-detail',
    category: 'Botanical',
  },
  {
    name: 'Lines with a life of their own',
    image: 'tattoo-back-art',
    category: 'Blackwork',
  },
  {
    name: 'Something worth keeping',
    image: 'tattoo-arm-floral',
    category: 'Botanical',
  },
  {
    name: 'A quiet kind of statement',
    image: 'tattoo-hands',
    category: 'Details',
  },
  { name: 'Made by hand', image: 'tattoo-overhead', category: 'In the studio' },
  { name: 'A closer look', image: 'tattoo-process', category: 'Details' },
  {
    name: 'Time, care, craft',
    image: 'client-session',
    category: 'In the studio',
  },
  {
    name: 'The next chapter',
    image: 'tattoo-consultation',
    category: 'In the studio',
  },
];
export default function Gallery() {
  const [filter, setFilter] = useState('All work');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [booking, setBooking] = useState(false);
  const [design, setDesign] = useState('Custom artwork');
  const items = collection.filter(
    (x) =>
      (filter === 'All work' || x.category === filter) &&
      x.name.toLowerCase().includes(search.toLowerCase()),
  );
  const current = selected === null ? null : items[selected];
  return (
    <>
      <PageIntro
        label="FROM IDEA TO INK"
        title="Made to be inked."
        text="A home for the work you can’t wait to make. Explore how collections could look, then try an example booking."
      />
      <section className="container gallery-page">
        <div className="gallery-controls">
          <div className="filter-list">
            {['All work', 'Botanical', 'Blackwork', 'Details', 'In the studio'].map((f) => (
              <button
                key={f}
                className={f === filter ? 'active' : ''}
                aria-pressed={f === filter}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search gallery"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder="Find a little inspiration"
            />
          </label>
        </div>
        <div className="gallery-disclaimer">
          <Label>EDITORIAL COLLECTION SHOWCASE</Label>
          <p>
            Real stock photography, illustrative collection names. These are not available flash
            designs or Venue artist listings.
          </p>
        </div>
        <p className="sr-only" aria-live="polite">
          {items.length} results
        </p>
        <div className="gallery-masonry">
          {items.map((item, i) => (
            <Reveal className="gallery-item" delay={(i % 3) * 0.06} key={item.name}>
              <button
                className="gallery-image"
                onClick={() => setSelected(i)}
                aria-label={`View ${item.name}`}
              >
                <Photo name={item.image} alt={item.name} />
                <span className="gallery-view">
                  <ArrowUpRight />
                </span>
              </button>
              <div className="gallery-item-title">
                <div>
                  <small>{item.category}</small>
                  <h2>{item.name}</h2>
                </div>
                <button
                  className={`icon-button ${favorites.includes(item.name) ? 'favorite' : ''}`}
                  aria-label={`${favorites.includes(item.name) ? 'Unsave' : 'Save'} ${item.name}`}
                  aria-pressed={favorites.includes(item.name)}
                  onClick={() => {
                    setFavorites((s) =>
                      s.includes(item.name) ? s.filter((n) => n !== item.name) : [...s, item.name],
                    );
                    toast('Example collection preference updated');
                  }}
                >
                  <Heart size={20} fill={favorites.includes(item.name) ? 'currentColor' : 'none'} />
                </button>
              </div>
            </Reveal>
          ))}
        </div>
        {items.length === 0 && (
          <div className="empty-state">
            <h2>No work in this corner yet.</h2>
            <p>Try another search or collection.</p>
            <Button
              onClick={() => {
                setSearch('');
                setFilter('All work');
              }}
            >
              Show all work
            </Button>
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
              Venue lets artists organize flash, build collections and choose whether a design is
              repeatable. Your booking link gives clients a way to find the work and send a request.
            </p>
            <Button
              onClick={() => {
                setDesign('Custom artwork');
                setBooking(true);
              }}
            >
              Try the booking example <ArrowUpRight size={18} />
            </Button>
          </Reveal>
          <Photo name="neon-tattoo-tools" alt="Tattoo equipment in a colorful studio" />
        </div>
      </section>
      <CTA />
      <Dialog.Root
        open={current !== null}
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
            {current && (
              <>
                <Photo name={current.image} alt={current.name} />
                <div className="lightbox-caption">
                  <div>
                    <Dialog.Title>{current.name}</Dialog.Title>
                    <Dialog.Description>
                      Editorial photograph · example collection
                    </Dialog.Description>
                  </div>
                  <Button
                    onClick={() => {
                      setDesign(current.name);
                      setSelected(null);
                      setBooking(true);
                    }}
                  >
                    Try an example request <ArrowUpRight size={17} />
                  </Button>
                </div>
                <button
                  className="lightbox-prev icon-button"
                  aria-label="Previous photograph"
                  onClick={() => setSelected((selected! + items.length - 1) % items.length)}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="lightbox-next icon-button"
                  aria-label="Next photograph"
                  onClick={() => setSelected((selected! + 1) % items.length)}
                >
                  <ChevronRight />
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <BookingWizard open={booking} onOpenChange={setBooking} design={design} />
    </>
  );
}
