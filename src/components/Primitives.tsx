import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import images from "../data/image-manifest.json";
export function Photo({
  name,
  alt = "",
  className = "",
  eager = false,
  position,
}: {
  name: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  position?: string;
}) {
  const [failed, setFailed] = useState(false);
  const entry = images.find((i) => i.id === name);
  return (
    <img
      className={`photo ${className}`}
      src={failed ? "/image-fallback.svg" : `/images/${name}.webp`}
      srcSet={
        failed
          ? undefined
          : `/images/${name}-640.webp 640w, /images/${name}.webp ${entry?.width || 1920}w`
      }
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 50vw"
      width={entry?.width || 1600}
      height={entry?.height || 1200}
      alt={entry?.alt || alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      style={{ objectPosition: position }}
      onError={() => setFailed(true)}
    />
  );
}
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={
        reduced ? false : { opacity: 0, y: 45, clipPath: "inset(6% 0 0 0)" }
      }
      whileInView={{ opacity: 1, y: 0, clipPath: "inset(0% 0 0 0)" }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
export function Label({
  children,
  light = false,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <span className={`eyebrow ${light ? "eyebrow-light" : ""}`}>
      <span className="little-cross">✳</span>
      {children}
    </span>
  );
}
export function ArrowLink({
  to,
  children,
  light = false,
}: {
  to: string;
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <Link className={`arrow-link ${light ? "light" : ""}`} to={to}>
      {children}
      <ArrowUpRight size={21} />
    </Link>
  );
}
export function CTA({
  title = "Your next chapter. Less admin.",
  text = "Make more space for what you got into this for.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="closing-cta">
      <div className="orbit-mark" aria-hidden="true">
        ✳
      </div>
      <Reveal>
        <Label>GOOD ART STARTS WITH A LITTLE SPACE</Label>
        <h2>{title}</h2>
        <p>{text}</p>
        <Button asChild variant="dark">
          <Link to="/get-started">
            Find your Venue <ArrowUpRight size={19} />
          </Link>
        </Button>
        <span className="cta-note">
          For independent artists. For the whole studio.
        </span>
      </Reveal>
    </section>
  );
}
export function FAQs({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root type="single" collapsible className="accordion">
      {items.map((f, i) => (
        <Accordion.Item value={String(i)} key={f.q}>
          <Accordion.Header>
            <Accordion.Trigger>
              {f.q}
              <Plus size={20} />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <p>{f.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
export function PageIntro({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <section className="page-intro container">
      <Reveal>
        <Label>{label}</Label>
        <h1>{title}</h1>
        <p>{text}</p>
      </Reveal>
    </section>
  );
}
export function DemoBadge() {
  return (
    <span className="demo-badge">
      <i /> Interactive example
    </span>
  );
}
