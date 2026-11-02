import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useInView,
} from 'motion/react';
import {
  ArrowUpRight,
  PenTool,
  CalendarDays,
  MessageSquare,
  ChevronRight,
  MoveHorizontal,
} from 'lucide-react';
import { Photo, Label } from './Primitives';
type Ripple = { id: number; x: number; y: number };
export function TouchFeedback() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const handler = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const target = event.target as HTMLElement;
      if (!target.closest('button,a,[data-touch-feedback]')) return;
      setRipples((list) => [
        ...list.slice(-2),
        { id: performance.now(), x: event.clientX, y: event.clientY },
      ]);
      if ('vibrate' in navigator) navigator.vibrate(7);
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, [reduced]);
  return (
    <div className="touch-feedback-layer" aria-hidden="true">
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="touch-ink-ring"
            style={{ left: ripple.x, top: ripple.y }}
            initial={{ scale: 0.15, opacity: 0.65 }}
            animate={{ scale: 2.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            onAnimationComplete={() => setRipples((list) => list.filter((r) => r.id !== ripple.id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
export function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const visible = useInView(ref, { amount: 0.05 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-10%', '16%']);
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 4]);
  const [step, setStep] = useState(0);
  const content = [
    {
      icon: PenTool,
      kicker: '01 / THE IDEA',
      title: 'Start with a mark.',
      text: 'Choose your artist. Share the idea that has been on your mind.',
      photo: 'tattoo-consultation',
    },
    {
      icon: CalendarDays,
      kicker: '02 / THE SPACE',
      title: 'Find your moment.',
      text: 'Explore available times and send your request. Keep every detail together.',
      photo: 'hero-tattoo-session',
    },
    {
      icon: MessageSquare,
      kicker: '03 / THE CONNECTION',
      title: 'Make it personal.',
      text: 'Talk through the work with your artist and follow your appointment from your account.',
      photo: 'artist-at-work',
    },
  ];
  const active = content[step];
  return (
    <section ref={ref} className={`scroll-story ${visible ? 'is-active' : ''}`}>
      <div className="container scroll-story-grid">
        <div className="scroll-story-copy">
          <Label>FROM THE FIRST IDEA TO THE FINAL DETAIL</Label>
          <h2>
            Make room
            <br />
            for the work.
          </h2>
          <p>
            Drag through the process.
            <br />
            Your next chapter starts with a conversation.
          </p>
          <div className="story-track">
            <motion.i style={{ scaleX: reduced ? 1 : scrollYProgress }} />
          </div>
          <div className="story-steps">
            {content.map((item, i) => (
              <button
                key={item.kicker}
                aria-pressed={step === i}
                className={step === i ? 'active' : ''}
                onClick={() => setStep(i)}
              >
                <item.icon size={19} />
                <span>{item.kicker}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <Link className="arrow-link" to="/booking">
            Start your booking
            <ArrowUpRight size={19} />
          </Link>
        </div>
        <div className="story-artwork">
          <motion.div
            className="story-photo-back"
            style={{ y: reduced ? 0 : y, rotate: reduced ? 0 : rotate }}
          >
            <Photo name="tattoo-arm-floral" alt="Floral tattoo detail" />
          </motion.div>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={step}
              className="story-drag-card"
              drag={reduced ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 45)
                  setStep((current) => (current + (info.offset.x < 0 ? 1 : 2)) % 3);
              }}
              initial={reduced ? false : { opacity: 0, x: 80, rotate: 7, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -90, rotate: -7, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 130, damping: 20 }}
              whileTap={reduced ? undefined : { scale: 0.97, rotate: -1 }}
              data-touch-feedback
            >
              <Photo name={active.photo} alt={active.title} />
              <div>
                <small>{active.kicker}</small>
                <h3>{active.title}</h3>
                <p>{active.text}</p>
                <span>
                  <MoveHorizontal size={15} /> Swipe to explore
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
          <span className="story-caption">THE CRAFT COMES FIRST.</span>
        </div>
      </div>
    </section>
  );
}
export function MobileBookingAction() {
  const { pathname } = useLocation();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 25 });
  const hidden = ['/dashboard', '/admin', '/login', '/register', '/booking', '/bookings'].some(
    (path) => pathname.startsWith(path),
  );
  return hidden ? null : (
    <div className="mobile-booking-action">
      <motion.i style={{ scaleX }} />
      <Link to="/booking">
        <CalendarDays size={18} />
        <span>Make your next mark</span>
        <ArrowUpRight size={19} />
      </Link>
    </div>
  );
}
