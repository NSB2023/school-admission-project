import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  Fingerprint,
  GraduationCap,
  LayoutGrid,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Sunset,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import type { Hold, SchoolClass } from "./api";
import LandingHero from "./LandingHero";
import PaperPlane from "./PaperPlane";
import "./styles.css";

function storedIdentity() {
  try {
    return localStorage.getItem("schoolgate.student") || "";
  } catch {
    return "";
  }
}
const validIdentity = (value: string) => /^[0-9]{17}$/.test(value);
const year = new Date().getFullYear() + 1;
const shiftOf = (name: string) =>
  /morning/i.test(name)
    ? "Morning shift"
    : /day|afternoon/i.test(name)
      ? "Day shift"
      : "General admission";
const secondsLeft = (hold: Hold, now: number) =>
  Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000));
const statusOf = (hold: Hold, now: number) =>
  hold.status === "HELD" && !secondsLeft(hold, now) ? "EXPIRED" : hold.status;
const statusLabel = {
  HELD: "Seat reserved",
  CONFIRMED: "Confirmed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        className="icon-button close-dialog"
        onClick={onClose}
        aria-label="Close dialog"
      >
        <X size={20} />
      </button>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

export default function App() {
  const [student, setStudent] = useState(storedIdentity);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [view, setView] = useState<"classes" | "applications">("classes");
  const [modal, setModal] = useState<"create" | "guide" | null>(null);
  const [selectedHold, setSelectedHold] = useState<Hold | null>(null);
  const [error, setError] = useState<{
    message: string;
    network?: boolean;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [shift, setShift] = useState("All shifts");
  const [now, setNow] = useState(Date.now());
  const identityInput = useRef<HTMLInputElement>(null);
  const valid = validIdentity(student);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [nextClasses, nextHolds] = await Promise.all([
          api<SchoolClass[]>("/classes", { signal: controller.signal }),
          valid
            ? api<Hold[]>("/me/holds", { signal: controller.signal }, student)
            : Promise.resolve([]),
        ]);
        if (controller.signal.aborted) return;
        setClasses(nextClasses);
        setHolds(nextHolds);
        setSelectedHold((previous) =>
          previous
            ? nextHolds.find((h) => h.holdId === previous.holdId) || previous
            : null,
        );
        setUpdated(new Date());
        setError((previous) => (previous?.network ? null : previous));
      } catch (failure) {
        if (!controller.signal.aborted)
          setError({ message: (failure as Error).message, network: true });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, 3000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [student, valid, refresh]);

  function changeIdentity(value: string) {
    setStudent(value);
    setHolds([]);
    setSelectedHold(null);
    setError(null);
    try {
      localStorage.setItem("schoolgate.student", value);
    } catch {
      /* The form remains usable without local storage. */
    }
  }

  async function action(key: string, work: () => Promise<void>) {
    setPending(key);
    setError(null);
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError({ message: (failure as Error).message });
    } finally {
      setPending("");
      setRefresh((v) => v + 1);
    }
  }

  function apply(c: SchoolClass) {
    if (!valid) {
      setError({
        message:
          "Enter your 17-digit birth registration number above to reserve a seat.",
      });
      identityInput.current?.focus();
      return;
    }
    void action(c.id, async () => {
      const hold = await api<Hold>(
        `/classes/${c.id}/holds`,
        { method: "POST" },
        student,
      );
      setHolds((previous) => [hold, ...previous]);
      setSelectedHold(hold);
    });
  }

  function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action("create", async () => {
      await api("/classes", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          totalSeats: Number(form.get("seats")),
        }),
      });
      setModal(null);
      setView("classes");
      setShift("All shifts");
      setQuery("");
      setNotice("Class created. It is now ready to receive applications.");
    });
  }

  function changeHold(hold: Hold, confirm: boolean) {
    void action(hold.holdId, async () => {
      if (confirm) {
        await api(`/holds/${hold.holdId}/confirm`, { method: "POST" }, student);
        const next: Hold = { ...hold, status: "CONFIRMED" };
        setSelectedHold(next);
        setHolds((previous) =>
          previous.map((h) => (h.holdId === hold.holdId ? next : h)),
        );
      } else {
        await api(`/holds/${hold.holdId}`, { method: "DELETE" }, student);
        setSelectedHold(null);
        setHolds((previous) =>
          previous.map((h) =>
            h.holdId === hold.holdId ? { ...h, status: "CANCELLED" } : h,
          ),
        );
        setNotice(
          "Reservation cancelled. The seat is available to another student.",
        );
      }
    });
  }

  const activeHolds = holds.filter((h) =>
    ["HELD", "CONFIRMED"].includes(statusOf(h, now)),
  );
  const filtered = classes.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      (shift === "All shifts" || shiftOf(c.name) === shift),
  );
  const totals = classes.reduce(
    (sum, c) => ({
      seats: sum.seats + c.totalSeats,
      available: sum.available + c.availableSeats,
    }),
    { seats: 0, available: 0 },
  );
  const selectedStatus = selectedHold ? statusOf(selectedHold, now) : null;
  const remaining = selectedHold ? secondsLeft(selectedHold, now) : 0;
  const navigation = (
    <>
      <button
        className={view === "classes" ? "nav-item active" : "nav-item"}
        onClick={() => setView("classes")}
      >
        <LayoutGrid size={19} />
        Available classes
        <PaperPlane size={15} className="nav-arrow" />
      </button>
      <button
        className={view === "applications" ? "nav-item active" : "nav-item"}
        onClick={() => setView("applications")}
      >
        <FileText size={19} />
        My applications
        {activeHolds.length > 0 && (
          <span className="nav-count">{activeHolds.length}</span>
        )}
      </button>
      <button className="nav-item" onClick={() => setModal("guide")}>
        <CircleHelp size={19} />
        How it works
        <PaperPlane size={15} className="nav-arrow" />
      </button>
    </>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="workspace">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Schoolgate home">
            <span className="brand-mark">
              <GraduationCap size={30} strokeWidth={1.5} />
            </span>
            <span>
              schoolgate<small>A WORLD OF POSSIBILITY</small>
            </span>
          </a>
          <nav aria-label="Main navigation">{navigation}</nav>
          <div className="topbar-right">
            <span className="year-chip">ADMISSIONS {year}</span>
            <button
              className="button button-small button-outline"
              onClick={() => {
                setError(null);
                setModal("create");
              }}
            >
              <Plus size={16} />
              Create class
            </button>
          </div>
        </header>
        <main id="main">
          <LandingHero
            year={year}
            shift={shift}
            onShift={setShift}
            onGuide={() => setModal("guide")}
            onExplore={() => {
              setView("classes");
              document
                .getElementById("list-heading")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <div className="enrollment-shell">
            <div className="enrollment-intro">
              <span>THE FIRST STEP IS YOURS.</span>
              <span>{year} / SCHOOL ADMISSIONS</span>
            </div>
            <section
              className="identity-card"
              aria-labelledby="identity-heading"
            >
              <span className="identity-icon">
                <Fingerprint size={26} strokeWidth={1.5} />
              </span>
              <div className="identity-copy">
                <h2 id="identity-heading">Let's make this your journey</h2>
                <p>
                  Enter your birth registration number to apply and find your
                  applications.
                </p>
              </div>
              <div className="identity-input">
                <label htmlFor="student-id">Birth registration number</label>
                <div className={valid ? "input-wrap valid" : "input-wrap"}>
                  <input
                    id="student-id"
                    ref={identityInput}
                    value={student}
                    onChange={(e) => changeIdentity(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={17}
                    placeholder="Your 17-digit registration number"
                    aria-describedby="identity-hint"
                    disabled={!!pending}
                  />
                  {valid ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                </div>
                <span id="identity-hint">
                  {valid
                    ? "Ready to apply · saved on this device"
                    : "17 digits · no login needed"}
                </span>
              </div>
            </section>

            {error && (
              <div className="error-banner" role="alert">
                <CircleHelp size={19} />
                <div>{error.message}</div>
                {error.network && (
                  <button onClick={() => setRefresh((v) => v + 1)}>
                    Try again
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice-banner" role="status">
                <CheckCircle2 size={18} />
                {notice}
                <button
                  className="icon-button"
                  onClick={() => setNotice("")}
                  aria-label="Dismiss notification"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <section className="stats" aria-label="Admissions at a glance">
              <div className="stat">
                <span className="stat-icon">
                  <BookOpen size={23} />
                </span>
                <div>
                  <span className="stat-label accent">Ways to begin</span>
                  <strong>
                    {loading ? "—" : String(classes.length).padStart(2, "0")}
                  </strong>
                </div>
                <span className="stat-note">Find your fit</span>
              </div>
              <div className="stat">
                <span className="stat-icon">
                  <Users size={23} />
                </span>
                <div>
                  <span className="stat-label accent">
                    Places for possibility
                  </span>
                  <strong>
                    {loading ? "—" : totals.available}
                    <small> / {totals.seats}</small>
                  </strong>
                </div>
                <span className="stat-note live">
                  <i />
                  Live availability
                </span>
              </div>
              <button
                className="stat stat-link"
                onClick={() => setView("applications")}
              >
                <span className="stat-icon">
                  <FileText size={23} />
                </span>
                <div>
                  <span className="stat-label">My applications</span>
                  <strong>
                    {valid ? String(holds.length).padStart(2, "0") : "—"}
                  </strong>
                </div>
                <PaperPlane size={20} className="stat-arrow" />
              </button>
            </section>

            <section className="list-section" aria-labelledby="list-heading">
              <div className="section-heading">
                <div>
                  <div className="overline">
                    {view === "classes"
                      ? "MAKE ROOM FOR POSSIBILITY"
                      : "EVERY STEP, IN ONE PLACE"}
                  </div>
                  <h2 id="list-heading">
                    {view === "classes"
                      ? "Find your next classroom"
                      : "Your applications"}
                    <span>
                      {view === "classes" ? classes.length : holds.length}
                    </span>
                  </h2>
                  <p>
                    {view === "classes"
                      ? "One application. A whole new beginning. Choose a class to get started."
                      : "Follow your reservations, confirm admission, and see your application history."}
                  </p>
                </div>
                <span className="refresh-label">
                  <span
                    className={
                      error?.network
                        ? "connection-dot offline"
                        : "connection-dot"
                    }
                  />
                  {error?.network
                    ? "Connection interrupted"
                    : updated
                      ? "Updates automatically"
                      : "Connecting…"}
                </span>
              </div>
              {view === "classes" && (
                <div className="filter-row">
                  <div
                    className="shift-tabs"
                    role="group"
                    aria-label="Filter by shift"
                  >
                    {["All shifts", "Morning shift", "Day shift"].map(
                      (item) => (
                        <button
                          key={item}
                          className={shift === item ? "selected" : ""}
                          onClick={() => setShift(item)}
                          aria-pressed={shift === item}
                        >
                          {item === "Morning shift" && <Sun size={15} />}
                          {item === "Day shift" && <Sunset size={15} />}
                          {item === "All shifts" && <LayoutGrid size={15} />}
                          {item === "Morning shift"
                            ? "Morning"
                            : item === "Day shift"
                              ? "Day shift"
                              : item}
                        </button>
                      ),
                    )}
                  </div>
                  <label className="search-input">
                    <Search size={17} />
                    <input
                      aria-label="Search classes"
                      placeholder="Search for a class…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
              )}

              {loading ? (
                <div className="class-grid" aria-label="Loading classes">
                  {[1, 2, 3].map((i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : view === "classes" ? (
                filtered.length ? (
                  <div className="class-grid">
                    {filtered.map((c) => (
                      <ClassCard
                        key={c.id}
                        c={c}
                        hold={activeHolds.find((h) => h.classId === c.id)}
                        pending={!!pending}
                        onApply={() => apply(c)}
                        onView={(hold) => setSelectedHold(hold)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={
                      classes.length
                        ? "No matching classes"
                        : "A new beginning is on its way"
                    }
                    text={
                      classes.length
                        ? "Try another search or choose a different shift."
                        : "Classes will appear here as your school opens them for admission."
                    }
                    action={
                      classes.length ? (
                        <button
                          className="button button-outline"
                          onClick={() => {
                            setQuery("");
                            setShift("All shifts");
                          }}
                        >
                          Clear filters
                        </button>
                      ) : (
                        <button
                          className="button button-outline"
                          onClick={() => setModal("create")}
                        >
                          <Plus size={17} />
                          Create the first class
                        </button>
                      )
                    }
                  />
                )
              ) : !valid ? (
                <Empty
                  title={
                    <>
                      Your journey <span className="accent">belongs here</span>
                    </>
                  }
                  text="Enter your 17-digit birth registration number above to find your applications."
                  action={
                    <button
                      className="button button-outline"
                      onClick={() => identityInput.current?.focus()}
                    >
                      Enter registration number
                      <PaperPlane size={16} />
                    </button>
                  }
                />
              ) : holds.length ? (
                <div className="class-grid">
                  {holds.map((hold) => (
                    <ApplicationCard
                      key={hold.holdId}
                      hold={hold}
                      now={now}
                      onView={() => setSelectedHold(hold)}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Your next chapter is still unwritten"
                  text="Reserve a seat in an available class and your application will appear here."
                  action={
                    <button
                      className="button"
                      onClick={() => setView("classes")}
                    >
                      Explore classes
                      <PaperPlane size={16} />
                    </button>
                  }
                />
              )}
            </section>

            <footer className="main-footer">
              <span>
                <ShieldCheck size={14} />
                Seats are allocated on a first-come, first-served basis.
              </span>
              <button onClick={() => setModal("guide")}>
                How admissions work
                <PaperPlane size={13} />
              </button>
            </footer>
          </div>
        </main>
      </div>

      {modal === "create" && (
        <Dialog
          title="Create a class"
          onClose={() => {
            if (!pending) setModal(null);
          }}
        >
          <p className="dialog-intro">
            Give a new group of students a place to begin. Create each shift as
            a separate class.
          </p>
          <form onSubmit={createClass} className="create-form">
            <label>
              Class name
              <input
                name="name"
                required
                placeholder="e.g. Class 6 – Morning Shift"
                autoFocus
              />
            </label>
            <label>
              Total seats
              <input
                name="seats"
                type="number"
                required
                min="1"
                step="1"
                placeholder="e.g. 120"
              />
            </label>
            {error && <p className="form-error">{error.message}</p>}
            <button className="button" disabled={!!pending}>
              {pending === "create" ? "Creating…" : "Create class"}
              <Plus size={17} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "guide" && (
        <Dialog
          title="A little guidance for a big step"
          onClose={() => setModal(null)}
        >
          <p className="dialog-intro">
            Everything you need to know before you begin.
          </p>
          <ol className="guide-steps">
            <li>
              <b>
                0<span className="accent">1</span>
              </b>
              <div>
                <h3>Make it yours</h3>
                <p>
                  Enter your 17-digit birth registration number. Your
                  applications are linked to this number; no account is needed.
                </p>
              </div>
            </li>
            <li>
              <b>
                0<span className="accent">2</span>
              </b>
              <div>
                <h3>Find your classroom</h3>
                <p>
                  Choose a class and shift, then apply. A seat is reserved for
                  the time shown in your reservation.
                </p>
              </div>
            </li>
            <li>
              <b>
                0<span className="accent">3</span>
              </b>
              <div>
                <h3>Take the next step</h3>
                <p>
                  Select “Pay admission fee” before the timer ends to confirm.
                  Payment is simulated for this assignment; no money is
                  collected.
                </p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <Clock3 size={18} />
            Unconfirmed reservations expire automatically so another student has
            a chance.
          </div>
          <button className="button" onClick={() => setModal(null)}>
            I'm ready to begin
            <PaperPlane size={17} />
          </button>
        </Dialog>
      )}
      {selectedHold && (
        <Dialog
          title={
            selectedStatus === "CONFIRMED"
              ? "Admission confirmed"
              : selectedStatus === "HELD"
                ? "Your seat is reserved"
                : selectedStatus === "EXPIRED"
                  ? "This reservation has expired"
                  : "Reservation cancelled"
          }
          onClose={() => {
            if (!pending) setSelectedHold(null);
          }}
        >
          <div
            className={`reservation-icon ${selectedStatus === "CONFIRMED" ? "confirmed" : ""}`}
          >
            {selectedStatus === "CONFIRMED" ? (
              <CheckCircle2 size={34} />
            ) : (
              <GraduationCap size={34} />
            )}
          </div>
          <p className="dialog-intro">{selectedHold.className}</p>
          <div className="reservation-details">
            <span>
              Application reference
              <strong>{selectedHold.holdId.slice(0, 8).toUpperCase()}</strong>
            </span>
            <span>
              Status<strong>{statusLabel[selectedStatus!]}</strong>
            </span>
          </div>
          {selectedStatus === "HELD" ? (
            <>
              <div className="countdown">
                <Clock3 size={19} />
                <span>
                  Your seat is held for
                  <strong>
                    {String(Math.floor(remaining / 60)).padStart(2, "0")}:
                    {String(remaining % 60).padStart(2, "0")}
                  </strong>
                </span>
              </div>
              <p className="payment-note">
                Confirm before the timer ends. This is a simulated payment — no
                money will be collected.
              </p>
              <button
                className="button full-width"
                disabled={!!pending || !remaining}
                onClick={() => changeHold(selectedHold, true)}
              >
                {pending ? "Processing…" : "Pay admission fee"}
                <PaperPlane size={17} />
              </button>
              <button
                className="cancel-button"
                disabled={!!pending}
                onClick={() => changeHold(selectedHold, false)}
              >
                Cancel reservation
              </button>
            </>
          ) : (
            <>
              <p className="payment-note">
                {selectedStatus === "CONFIRMED"
                  ? "You’re all set! Your admission is confirmed and your seat is secured."
                  : "You can apply again from the class list if a seat is available."}
              </p>
              <button
                className="button full-width"
                onClick={() => {
                  setSelectedHold(null);
                  setView(
                    selectedStatus === "CONFIRMED" ? "applications" : "classes",
                  );
                }}
              >
                {selectedStatus === "CONFIRMED"
                  ? "View my applications"
                  : "Explore available classes"}
                <PaperPlane size={17} />
              </button>
            </>
          )}
          {error && <p className="form-error">{error.message}</p>}
        </Dialog>
      )}
    </div>
  );
}

function ClassCard({
  c,
  hold,
  pending,
  onApply,
  onView,
}: {
  c: SchoolClass;
  hold?: Hold;
  pending: boolean;
  onApply: () => void;
  onView: (hold: Hold) => void;
}) {
  const shift = shiftOf(c.name);
  const grade = /class\s+(\d+)/i.exec(c.name)?.[1];
  return (
    <article className="class-card" aria-label={c.name}>
      <div className="card-top">
        <span className="class-icon class-stamp">
          <small>{grade ? "CLASS" : "SCHOOL"}</small>
          <b>{grade || <PaperPlane size={38} />}</b>
        </span>
        <span
          className={`availability-badge ${c.availableSeats === 0 ? "full" : c.availableSeats <= 10 ? "limited" : ""}`}
        >
          <i />
          {c.availableSeats === 0
            ? "Currently full"
            : c.availableSeats <= 10
              ? "Limited seats"
              : "Accepting applications"}
        </span>
      </div>
      <h3>{c.name}</h3>
      <div className="shift-label">
        {shift === "Morning shift" ? (
          <Sun size={14} />
        ) : shift === "Day shift" ? (
          <Sunset size={14} />
        ) : (
          <GraduationCap size={14} />
        )}
        {shift}
        <span>·</span>Academic year {year}
      </div>
      <div className="seat-head">
        <div>
          <strong>{c.availableSeats}</strong>{" "}
          <span>
            {c.availableSeats === 1 ? "seat available" : "seats available"}
          </span>
        </div>
        <span>of {c.totalSeats} total</span>
      </div>
      <div
        className="seat-track"
        aria-label={`${c.confirmedSeats} confirmed, ${c.heldSeats} reserved, ${c.availableSeats} available`}
      >
        <span
          style={{ width: `${(c.confirmedSeats / c.totalSeats) * 100}%` }}
        />
        <span
          className="held-track"
          style={{ width: `${(c.heldSeats / c.totalSeats) * 100}%` }}
        />
      </div>
      <div className="seat-key">
        <span>
          <i />
          {c.confirmedSeats} confirmed
        </span>
        <span>
          <i className="held-dot" />
          {c.heldSeats} reserved
        </span>
      </div>
      <div className="card-action">
        <span>
          <ShieldCheck size={14} />
          {hold?.status === "CONFIRMED"
            ? "Your seat is secured"
            : hold
              ? "Your seat is on hold"
              : "First come, first served"}
        </span>
        <button
          className={`button ${hold ? "button-outline" : ""}`}
          disabled={pending || (!hold && c.availableSeats === 0)}
          onClick={() => (hold ? onView(hold) : onApply())}
        >
          {hold
            ? hold.status === "CONFIRMED"
              ? "View admission"
              : "View reservation"
            : c.availableSeats === 0
              ? "No seats available"
              : "Apply now"}
          <PaperPlane size={16} />
        </button>
      </div>
    </article>
  );
}

function ApplicationCard({
  hold,
  now,
  onView,
}: {
  hold: Hold;
  now: number;
  onView: () => void;
}) {
  const status = statusOf(hold, now);
  return (
    <article
      className="class-card application-card"
      aria-label={hold.className}
    >
      <div className="card-top">
        <span className="class-icon">
          <FileText size={24} />
        </span>
        <span
          className={`availability-badge ${status === "HELD" ? "limited" : status === "CONFIRMED" ? "" : "full"}`}
        >
          {status === "CONFIRMED" ? <Check size={13} /> : <Clock3 size={13} />}
          {statusLabel[status]}
        </span>
      </div>
      <h3>{hold.className}</h3>
      <p className="application-reference">
        Application #{hold.holdId.slice(0, 8).toUpperCase()}
      </p>
      <p className="application-description">
        {status === "HELD"
          ? "Your next step: confirm admission before your reservation expires."
          : status === "CONFIRMED"
            ? "Your place is secured. Here’s to a wonderful new school year."
            : "This application is part of your history. You can explore available classes again."}
      </p>
      <button className="button button-outline" onClick={onView}>
        {status === "HELD" ? "Complete admission" : "View application"}
        <PaperPlane size={16} />
      </button>
    </article>
  );
}

function Empty({
  title,
  text,
  action,
}: {
  title: ReactNode;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <GraduationCap size={32} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
