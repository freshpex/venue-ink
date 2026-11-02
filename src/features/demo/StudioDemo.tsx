import { useState } from "react";
import {
  CalendarDays,
  Inbox,
  MessageSquare,
  Palette,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Check,
  RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDemo } from "./store";
import { DemoBadge } from "../../components/Primitives";
import { toast } from "sonner";
const tabs = [
  { name: "Calendar", icon: CalendarDays },
  { name: "Requests", icon: Inbox },
  { name: "Messages", icon: MessageSquare },
  { name: "Flash", icon: Palette },
];
export function StudioDemo({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState("Calendar");
  const [artist, setArtist] = useState("All artists");
  const [month, setMonth] = useState(new Date(2026, 10, 1));
  const [day, setDay] = useState(12);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    "Could we try the botanical design on the forearm?",
  ]);
  const { requests, update, reset } = useDemo();
  const filtered = requests.filter(
    (r) => artist === "All artists" || r.artist === artist,
  );
  return (
    <div className={`studio-demo ${compact ? "compact" : ""}`}>
      <div className="demo-toolbar">
        <span className="workspace-name">
          <span className="workspace-icon">V</span> The studio{" "}
          <ChevronRight size={14} />
        </span>
        <DemoBadge />
      </div>
      <div className="demo-shell">
        <aside className="demo-sidebar">
          <span className="sidebar-caption">YOUR WORKSPACE</span>
          {tabs.map((t) => (
            <button
              className={tab === t.name ? "selected" : ""}
              onClick={() => setTab(t.name)}
              key={t.name}
            >
              <t.icon size={17} />
              <span>{t.name}</span>
              {t.name === "Requests" && (
                <b>
                  {requests.filter((r) => r.status === "New request").length}
                </b>
              )}
            </button>
          ))}
          <div className="sidebar-bottom">
            <span className="avatar">A</span>
            <span>
              Alex’s workspace<small>Example studio</small>
            </span>
          </div>
        </aside>
        <div className="demo-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="demo-heading">
                <div>
                  <small>SPACE FOR THE GOOD STUFF</small>
                  <h3>
                    {tab === "Calendar"
                      ? "A good week ahead."
                      : tab === "Requests"
                        ? "Your next great piece."
                        : tab === "Messages"
                          ? "Keep the conversation going."
                          : "Your ideas, all together."}
                  </h3>
                </div>
                <button
                  className="icon-button"
                  title="Reset example workspace"
                  aria-label="Reset example workspace"
                  onClick={() => {
                    reset();
                    toast("Example workspace reset");
                  }}
                >
                  <RotateCcw size={17} />
                </button>
              </div>
              {tab === "Calendar" ? (
                <>
                  <div className="calendar-toolbar">
                    <strong>
                      {month.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                    <div>
                      <button
                        aria-label="Previous month"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        aria-label="Next month"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronRight size={16} />
                      </button>
                      <select
                        aria-label="Filter calendar by artist"
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                      >
                        <option>All artists</option>
                        <option>Alex</option>
                        <option>River</option>
                      </select>
                    </div>
                  </div>
                  <div className="calendar-grid">
                    {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
                      (d) => (
                        <span className="calendar-weekday" key={d}>
                          {d}
                        </span>
                      ),
                    )}
                    {Array.from(
                      {
                        length:
                          (new Date(
                            month.getFullYear(),
                            month.getMonth(),
                            1,
                          ).getDay() +
                            6) %
                          7,
                      },
                      (_, i) => (
                        <span
                          key={`blank-${i}`}
                          className="calendar-cell blank"
                        />
                      ),
                    )}
                    {Array.from(
                      {
                        length: new Date(
                          month.getFullYear(),
                          month.getMonth() + 1,
                          0,
                        ).getDate(),
                      },
                      (_, i) => {
                        const rs = filtered.filter(
                          (r) => r.day === i + 1 && r.status !== "Declined",
                        );
                        return (
                          <button
                            key={i}
                            aria-label={`${month.toLocaleDateString("en-US", { month: "long" })} ${i + 1}, ${rs.length} example appointments`}
                            className={`calendar-cell ${i + 1 === day ? "chosen" : ""}`}
                            onClick={() => setDay(i + 1)}
                          >
                            <span>{i + 1}</span>
                            {rs.slice(0, 2).map((r, j) => (
                              <small
                                className={
                                  j % 2 ? "event-violet" : "event-lime"
                                }
                                key={r.id}
                              >
                                {r.time} <span>{r.design}</span>
                              </small>
                            ))}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <div className="calendar-summary">
                    <span>
                      <i />{" "}
                      {
                        filtered.filter(
                          (r) => r.day === day && r.status !== "Declined",
                        ).length
                      }{" "}
                      example appointments on day {day}
                    </span>
                    <button onClick={() => setTab("Requests")}>
                      View requests <ArrowUpRight size={14} />
                    </button>
                  </div>
                </>
              ) : tab === "Requests" ? (
                <div className="request-list">
                  {requests.map((r) => (
                    <div className="request-row" key={r.id}>
                      <span className="avatar">{r.artist[0]}</span>
                      <div>
                        <strong>{r.design}</strong>
                        <small>
                          {r.artist} · Day {r.day}, {r.time}
                        </small>
                      </div>
                      <span
                        className={`status ${r.status === "Approved" ? "approved" : ""}`}
                      >
                        {r.status}
                      </span>
                      {r.status === "New request" && (
                        <div className="request-actions">
                          <button
                            aria-label={`Approve ${r.design}`}
                            onClick={() => {
                              update(r.id, "Approved");
                              toast.success(
                                "Example request approved. No client was notified.",
                              );
                            }}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            aria-label={`Decline ${r.design}`}
                            onClick={() => {
                              update(r.id, "Declined");
                              toast("Example request declined");
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="fine-print">
                    All names, requests and availability in this workspace are
                    illustrative.
                  </p>
                </div>
              ) : tab === "Messages" ? (
                <div className="message-demo">
                  <span className="status">Local conversation example</span>
                  {messages.map((m, i) => (
                    <p
                      key={i}
                      className={i % 2 ? "sent-bubble" : "received-bubble"}
                    >
                      {m}
                    </p>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (message.trim()) {
                        setMessages([...messages, message.trim()]);
                        setMessage("");
                        toast("Added to the local example. Nothing was sent.");
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor="demo-message">
                      Example message
                    </label>
                    <input
                      id="demo-message"
                      placeholder="Try an example reply…"
                      maxLength={500}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <button aria-label="Add example message">
                      <ArrowUpRight size={19} />
                    </button>
                  </form>
                </div>
              ) : (
                <div className="mini-flash">
                  {[
                    "Botanical studies",
                    "Ornamental collection",
                    "Fine-line favorites",
                  ].map((t, i) => (
                    <button
                      key={t}
                      onClick={() => toast(`${t}: example collection selected`)}
                    >
                      <span aria-hidden="true">{["❋", "✳", "✦"][i]}</span>
                      <strong>{t}</strong>
                      <small>
                        Example collection <ArrowUpRight size={13} />
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
