import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Upload,
  CalendarDays,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "../../components/ui/button";
import { useDemo } from "../demo/store";
import { toast } from "sonner";
const schema = z.object({
  name: z.string().trim().min(2, "Enter an example name"),
  email: z.email("Enter a valid example email"),
  notes: z.string().max(1000),
  consent: z.literal(true, {
    error: "Confirm that you understand this is an example",
  }),
});
type Values = z.infer<typeof schema>;
export function BookingWizard({
  open,
  onOpenChange,
  design: initialDesign = "Custom artwork",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design?: string;
}) {
  const [step, setStep] = useState(0);
  const [artist, setArtist] = useState("Alex");
  const [service, setService] = useState("Custom tattoo");
  const [placement, setPlacement] = useState("Forearm");
  const [size, setSize] = useState("Medium · 10–15 cm");
  const [day, setDay] = useState(12);
  const [time, setTime] = useState("10:00");
  const [preview, setPreview] = useState("");
  const [done, setDone] = useState(false);
  const add = useDemo((s) => s.add);
  const requests = useDemo((s) => s.requests);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "Example client",
      email: "client@example.com",
      notes: "",
    },
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (open) {
      setStep(0);
      setDone(false);
      reset();
      setPreview("");
    }
  }, [open, reset]);
  function submit() {
    if (step !== 4 || done) return;
    if (
      requests.some(
        (r) =>
          r.day === day &&
          r.time === time &&
          r.artist === artist &&
          r.status !== "Declined",
      )
    ) {
      toast.error("That example slot is occupied. Choose another time.");
      setStep(2);
      return;
    }
    add({ design: initialDesign, artist, day, time, service });
    setDone(true);
    toast.success("Example request added to your local demo workspace");
  }
  const steps = [
    "The artist",
    "Your idea",
    "The date",
    "Your details",
    "Review",
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="booking-dialog">
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="Close booking example"
          >
            <X size={22} />
          </Dialog.Close>
          <div className="booking-dialog-head">
            <span className="demo-badge">
              <i /> Booking example
            </span>
            <Dialog.Title>
              {done
                ? "Look at that. You’re organized."
                : "Your next great piece starts here."}
            </Dialog.Title>
            <Dialog.Description>
              No real appointment or payment is created. Please use example
              details.
            </Dialog.Description>
          </div>
          {done ? (
            <div className="booking-success">
              <span>
                <Check size={36} />
              </span>
              <h3>Request saved in this browser.</h3>
              <p>
                {initialDesign} with {artist}
                <br />
                Example day {day} at {time}
              </p>
              <p className="fine-print">
                The artist has not been contacted. Explore the Requests tab in
                the studio demo to approve this example.
              </p>
              <Button onClick={() => onOpenChange(false)}>
                Back to exploring <ArrowRight size={18} />
              </Button>
            </div>
          ) : (
            <>
              <ol className="booking-progress">
                {steps.map((s, i) => (
                  <li
                    key={s}
                    aria-current={step === i ? "step" : undefined}
                    className={step >= i ? "active" : ""}
                  >
                    <span>{step > i ? <Check size={12} /> : i + 1}</span>
                    <small>{s}</small>
                  </li>
                ))}
              </ol>
              <form onSubmit={(event) => {
                event.preventDefault();
                const submitter = (event.nativeEvent as SubmitEvent).submitter;
                if (step === 4 && submitter?.getAttribute('data-final-booking') === 'true') {
                  void handleSubmit(submit)(event);
                }
              }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    className="booking-step"
                    initial={{ x: 12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -12, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {step === 0 ? (
                      <>
                        <h3>Find your creative fit.</h3>
                        <p>Fictional artists for this walkthrough.</p>
                        <div className="option-grid">
                          {["Alex", "River"].map((a, i) => (
                            <button
                              type="button"
                              className={`artist-option ${artist === a ? "selected" : ""}`}
                              onClick={() => setArtist(a)}
                              key={a}
                            >
                              <span className="avatar large">{a[0]}</span>
                              <strong>{a}</strong>
                              <small>
                                {i
                                  ? "Ornamental & blackwork"
                                  : "Botanical & fine line"}
                              </small>
                              {artist === a && <Check size={18} />}
                            </button>
                          ))}
                        </div>
                        <label>
                          Service
                          <select
                            value={service}
                            onChange={(e) => setService(e.target.value)}
                          >
                            <option>Custom tattoo</option>
                            <option>Flash tattoo</option>
                            <option>Piercing consultation</option>
                            <option>PMU consultation</option>
                          </select>
                        </label>
                      </>
                    ) : step === 1 ? (
                      <>
                        <h3>Tell us about the idea.</h3>
                        <span className="status">{initialDesign}</span>
                        <div className="form-grid">
                          <label>
                            Placement
                            <select
                              value={placement}
                              onChange={(e) => setPlacement(e.target.value)}
                            >
                              {[
                                "Forearm",
                                "Upper arm",
                                "Leg",
                                "Back",
                                "Other / discuss with artist",
                              ].map((p) => (
                                <option key={p}>{p}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Approximate size
                            <select
                              value={size}
                              onChange={(e) => setSize(e.target.value)}
                            >
                              {[
                                "Small · under 10 cm",
                                "Medium · 10–15 cm",
                                "Large · over 15 cm",
                                "Discuss with artist",
                              ].map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          Creative notes
                          <textarea
                            {...register("notes")}
                            placeholder="A little about the direction…"
                            rows={3}
                          />
                        </label>
                        <label className="upload-zone">
                          <Upload size={20} />
                          <span>
                            Add a reference image
                            <small>
                              JPEG, PNG or WebP · maximum 5 MB · stays in this
                              browser
                            </small>
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (
                                ![
                                  "image/jpeg",
                                  "image/png",
                                  "image/webp",
                                ].includes(file.type) ||
                                file.size > 5 * 1024 * 1024
                              ) {
                                toast.error(
                                  "Choose a JPEG, PNG or WebP under 5 MB",
                                );
                                e.target.value = "";
                                return;
                              }
                              setPreview(URL.createObjectURL(file));
                              toast("Reference selected locally");
                            }}
                          />
                        </label>
                        {preview && (
                          <div className="upload-preview">
                            <img
                              src={preview}
                              alt="Your locally selected reference"
                            />
                            <button
                              type="button"
                              onClick={() => setPreview("")}
                            >
                              Remove reference
                            </button>
                          </div>
                        )}
                      </>
                    ) : step === 2 ? (
                      <>
                        <h3>A little space in the calendar.</h3>
                        <p>
                          Illustrative dates only. These are not live artist
                          availability.
                        </p>
                        <div className="booking-date">
                          <CalendarDays size={20} /> Example month · choose a
                          day
                        </div>
                        <div className="date-options">
                          {[12, 13, 14, 15, 16, 17, 18, 19].map((d) => (
                            <button
                              type="button"
                              className={day === d ? "selected" : ""}
                              key={d}
                              onClick={() => setDay(d)}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        <label>
                          Preferred time
                          <select
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                          >
                            {[
                              "10:00",
                              "11:00",
                              "13:00",
                              "14:00",
                              "15:00",
                              "16:00",
                            ].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : step === 3 ? (
                      <>
                        <h3>Keep this one fictional.</h3>
                        <p>
                          Example details help you try the flow without sharing
                          personal information.
                        </p>
                        <label>
                          Example name
                          <input
                            {...register("name")}
                            autoComplete="off"
                            aria-invalid={!!errors.name}
                            aria-describedby="name-error"
                          />
                          {errors.name && (
                            <span className="field-error" id="name-error">
                              {errors.name.message}
                            </span>
                          )}
                        </label>
                        <label>
                          Example email
                          <input
                            {...register("email")}
                            type="email"
                            autoComplete="off"
                            aria-invalid={!!errors.email}
                            aria-describedby="email-error"
                          />
                          {errors.email && (
                            <span className="field-error" id="email-error">
                              {errors.email.message}
                            </span>
                          )}
                        </label>
                        <label className="checkbox-label">
                          <input type="checkbox" {...register("consent")} /> I
                          understand this is a local example, not a real
                          appointment.
                        </label>
                        {errors.consent && (
                          <span className="field-error">
                            {errors.consent.message}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <h3>One last look.</h3>
                        <dl className="booking-review">
                          {[
                            ["Artist", artist],
                            ["Artwork", initialDesign],
                            ["Service", service],
                            ["Placement", placement],
                            ["Size", size],
                            ["Preferred time", `Example day ${day} · ${time}`],
                            ["Deposit", "No payment collected"],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="fine-print">
                          In the live product, the artist reviews requests and
                          provides applicable booking and deposit terms. This
                          example only saves a fictional request in this
                          browser.
                        </p>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="booking-actions">
                  {step > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep(step - 1)}
                    >
                      <ArrowLeft size={17} /> Back
                    </Button>
                  ) : (
                    <span />
                  )}
                  {step < 4 ? (
                    <Button
                      key="continue-booking"
                      type="button"
                      onClick={async (event) => {
                        event.preventDefault();
                        if (step === 3) {
                          const valid = await new Promise<boolean>(
                            (resolve) => {
                              handleSubmit(
                                () => resolve(true),
                                () => resolve(false),
                              )();
                            },
                          );
                          if (!valid) return;
                        }
                        setStep(step + 1);
                      }}
                    >
                      Continue <ArrowRight size={17} />
                    </Button>
                  ) : (
                    <Button key="submit-booking" type="submit" data-final-booking="true">
                      Create example request <ArrowRight size={17} />
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
