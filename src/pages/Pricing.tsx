import { useState } from "react";
import { ArrowUpRight, Check, Info } from "lucide-react";
import { Button } from "../components/ui/button";
import { CTA, FAQs, Label, PageIntro, Reveal } from "../components/Primitives";
import { faqs, links, plans } from "../data/site";
import { estimateCosts } from "../lib/pricing";
export default function Pricing() {
  const [audience, setAudience] = useState("Artists");
  const [volume, setVolume] = useState(2000);
  const [artists, setArtists] = useState(5);
  const cost = estimateCosts(volume, artists);
  const shown = plans.filter((p) =>
    audience === "Artists"
      ? p.name.startsWith("Solo")
      : p.name.startsWith("Studio"),
  );
  return (
    <>
      <PageIntro
        label="LESS OVERHEAD. MORE HEADSPACE."
        title="Good art. Clear pricing."
        text="Start with your books. Add a little more when you need it. No monthly commitment on Solo or Studio."
      />
      <section className="container pricing-page">
        <div className="segmented" aria-label="Plan audience">
          {["Artists", "Studios"].map((a) => (
            <button
              key={a}
              aria-pressed={audience === a}
              className={audience === a ? "active" : ""}
              onClick={() => setAudience(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="pricing-grid">
          {shown.map((p) => (
            <Reveal
              className={`plan-card ${p.monthly ? "pro" : ""}`}
              key={p.name}
            >
              <div className="plan-card-top">
                <Label>{p.name}</Label>
                {p.monthly > 0 && (
                  <span className="plan-label">ROOM TO GROW</span>
                )}
              </div>
              <h2>{p.description}</h2>
              <div className="plan-price">
                ${p.monthly}
                <small>USD / month</small>
              </div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={18} />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant={p.monthly ? "default" : "dark"}>
                <a
                  href={
                    p.monthly
                      ? "https://instagram.com/m/venue.ink"
                      : links.signup
                  }
                >
                  {p.monthly ? "Talk to the team" : "Start with Venue"}{" "}
                  <ArrowUpRight size={18} />
                </a>
              </Button>
              <p className="fine-print">
                {p.rate !== null
                  ? `${p.rate * 100}% card processing, charged to clients by default.`
                  : "Studio card fees: confirm your setup with Venue."}
              </p>
            </Reveal>
          ))}
        </div>
        <div className="pricing-source">
          <Info size={18} />
          <p>
            Published USD pricing checked November 2, 2026. The studio feature
            page and pricing page contain differing fee wording. We do not infer
            a base Studio rate.{" "}
            <a href="https://www.venue.ink/pricing">
              Check current official pricing ↗
            </a>{" "}
            and confirm your terms with Venue.
          </p>
        </div>
        <section className="fee-calculator">
          <div>
            <Label>DO THE MATH FOR YOURSELF</Label>
            <h2>
              A little clarity
              <br />
              for your books.
            </h2>
            <p>
              Estimate monthly processing fees and subscription costs on the
              published plans.
            </p>
            <label>
              Monthly card payment volume (USD)
              <input
                type="number"
                min="0"
                max="10000000"
                step="100"
                value={volume}
                onChange={(e) =>
                  setVolume(Math.min(1e7, Math.max(0, Number(e.target.value))))
                }
              />
            </label>
            {audience === "Studios" && (
              <label>
                Active artists
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={artists}
                  onChange={(e) =>
                    setArtists(
                      Math.min(100, Math.max(1, Number(e.target.value))),
                    )
                  }
                />
              </label>
            )}
          </div>
          <div className="cost-results" aria-live="polite">
            {audience === "Artists" ? (
              <>
                <div>
                  <span>Solo · 10% processing</span>
                  <strong>${cost.solo.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Solo Pro · 5% + $50 monthly</span>
                  <strong>${cost.soloPro.toFixed(2)}</strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>Studio Pro · 5% processing</span>
                  <strong>${(volume * 0.05).toFixed(2)}</strong>
                </div>
                <div>
                  <span>Subscription + additional active artists</span>
                  <strong>
                    ${(150 + Math.max(0, artists - 5) * 35).toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span>Estimated total</span>
                  <strong>${cost.studioPro.toFixed(2)}</strong>
                </div>
              </>
            )}
            <p className="fine-print">
              Illustration only. Assumes the entered amount is the fee base,
              before processing fees. Totals combine subscription and processing
              even when the processing fee is paid by the client. Excludes
              taxes, refunds, disputes and optional payout charges. Not a quote
              or payment calculation.
            </p>
          </div>
        </section>
        <div className="comparison-table">
          <h2>The essentials, together.</h2>
          <table>
            <caption>Published feature comparison</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Solo</th>
                <th scope="col">Studio</th>
                <th scope="col">Pro</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Personal booking link", "Included", "Included", "Included"],
                ["Flash & client chat", "Included", "Included", "Included"],
                ["Shared team calendar", "—", "Included", "Studio Pro"],
                ["5% processing", "—", "Confirm with Venue", "Included"],
                [
                  "Automatic artist splits",
                  "—",
                  "Confirm with Venue",
                  "Studio Pro",
                ],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((v, i) =>
                    i === 0 ? (
                      <th scope="row" key={i}>
                        {v}
                      </th>
                    ) : (
                      <td key={i}>{v}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="faq-section">
          <div>
            <Label>THE SMALL PRINT, IN PLAIN ENGLISH</Label>
            <h2>Before you choose.</h2>
          </div>
          <FAQs items={[faqs[2], faqs[5], faqs[7]]} />
        </div>
      </section>
      <CTA />
    </>
  );
}
