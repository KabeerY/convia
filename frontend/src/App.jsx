import React, { useEffect, useRef, useState } from "react";
import TempleJourney from "./TempleJourney";
import BrandMark from "./BrandMark";

function Icon({ name = "arrow", size = 20, ...props }) {
  const paths = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    diagonal: (
      <>
        <path d="M6 18 18 6M6 6h12v12" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 8h16M4 16h16" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    down: <path d="M12 3v18m-6-6 6 6 6-6" />,
    heart: (
      <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 2 10 8 15 6-5 12-11 8-15Z" />
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
const Mark = BrandMark;
const trips = [
  {
    id: "ellora",
    place: "Ellora, Maharashtra",
    title: "A little history.\nA lot of wonder.",
    type: "Culture",
    tags: ["Slow mornings", "Architecture"],
    days: "3 days",
    people: "4–6 people",
    image: "/assets/kailasa-hero.png",
    position: "50% 55%",
    caption: "Walk through stories carved in stone.",
    itinerary: [
      "Sunset arrival & a shared dinner",
      "Explore the rock-cut wonders of Ellora",
      "A slow morning, chai & the road home",
    ],
  },
  {
    id: "mountains",
    place: "Manali, Himachal Pradesh",
    title: "Higher trails.\nCloser friendships.",
    type: "Adventure",
    tags: ["Fresh air", "Trail company"],
    days: "5 days",
    people: "4–8 people",
    image: "/assets/manali-sunrise.png",
    position: "50% 50%",
    caption: "For the people who take the scenic route.",
    itinerary: [
      "Meet your crew over mountain chai",
      "A day on the trails, at your pace",
      "Riverside time & a shared sunset",
    ],
  },
  {
    id: "coast",
    place: "Gokarna, Karnataka",
    title: "Less on the agenda.\nMore ocean.",
    type: "Unwind",
    tags: ["Ocean air", "No rush"],
    days: "3 days",
    people: "3–6 people",
    image:
      "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1000&q=85",
    position: "50% 50%",
    caption: "Good company. Absolutely no hurry.",
    itinerary: [
      "Arrive, settle in & catch the sunset",
      "A coastal walk and a long beach lunch",
      "One last swim before heading home",
    ],
  },
];

export default function App() {
  const [menu, setMenu] = useState(false),
    [filter, setFilter] = useState("All moods"),
    [selected, setSelected] = useState(null),
    [saved, setSaved] = useState([]),
    [voted, setVoted] = useState(false),
    [modal, setModal] = useState(null);

  const modalRef = useRef(null),
    previousFocus = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!modal) return;
    previousFocus.current = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      modalRef.current?.querySelector("button")?.focus(),
    );
    const keyboard = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const list = [
          ...modalRef.current.querySelectorAll("button,a[href],input,select"),
        ].filter((x) => !x.disabled);
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = old;
      window.removeEventListener("keydown", keyboard);
      previousFocus.current?.focus();
    };
  }, [modal]);
  function openTrip(trip) {
    setSelected(trip);
    setModal("trip");
  }
  function saveTrip(id) {
    setSaved((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  const filtered =
    filter === "All moods" ? trips : trips.filter((t) => t.type === filter);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <a className="brand" href="#" aria-label="Convia home">
          <Mark />
          convia<span className="brand-dot">®</span>
        </a>
        <nav className={menu ? "nav open" : "nav"} aria-label="Main navigation">
          <a href="#discover" onClick={() => setMenu(false)}>
            Trip inspiration
          </a>
          <a href="#together" onClick={() => setMenu(false)}>
            The Convia way
          </a>
          <a href="#trippy" onClick={() => setMenu(false)}>
            Meet Trippy <span className="tiny-spark">✳</span>
          </a>
        </nav>
        <a className="button nav-cta" href="/app">
          Sign in <Icon name="diagonal" size={16} />
        </a>
        <button
          className="menu-toggle"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Icon name={menu ? "close" : "menu"} />
        </button>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="hero-title-block">
              <div className="eyebrow">
                <span className="pulse-dot" /> THE WORLD IS BETTER TOGETHER
              </div>
              <h1 id="hero-title">
                Find your people.
                <br />
                Find your <span className="serif">somewhere.</span>
                <span className="title-star">✳</span>
              </h1>
            </div>
            <div className="hero-aside">
              <p>
                Some trips change your scenery.
                <br />
                The right people change everything.
              </p>
              <a className="button primary" href="/app?auth=signup">
                Create an account <Icon name="diagonal" />
              </a>
              <a className="text-link hero-signin" href="/app">
                Already have an account? Sign in
              </a>
            </div>
          </div>
          <TempleJourney />
          <div className="hero-bottom">
            <p>
              For the detours. The shared chai. The <em>“remember when?”</em>
            </p>
            <span>
              LESS LOGISTICS. MORE LIFE. <Icon name="spark" size={15} />
            </span>
          </div>
        </section>
        <section id="together" className="manifesto section reveal">
          <div className="eyebrow">01 / A BETTER WAY TO GO</div>
          <div className="manifesto-layout">
            <h2>
              Great places are only
              <br />
              <span className="muted">half the story.</span>
            </h2>
            <div>
              <p>
                The other half? People who get your pace.
                <br />
                Plans everyone has a say in. And room for
                <br className="desktop-break" /> something you didn’t see
                coming.
              </p>
              <a href="#trippy" className="text-link">
                That’s the Convia way <Icon name="diagonal" size={17} />
              </a>
            </div>
          </div>
          <div className="principles">
            <div>
              <span className="line-icon">
                <Icon name="people" size={23} />
              </span>
              <div>
                <h3>Your kind of company.</h3>
                <p>
                  Shared interests. Compatible energy.
                  <br />
                  People, beyond a profile picture.
                </p>
              </div>
            </div>
            <div>
              <span className="line-icon">
                <Icon name="check" size={23} />
              </span>
              <div>
                <h3>Everyone gets a say.</h3>
                <p>
                  One shared plan. Propose, vote,
                  <br />
                  and make it happen together.
                </p>
              </div>
            </div>
            <div>
              <span className="line-icon">
                <Icon name="spark" size={23} />
              </span>
              <div>
                <h3>A little help from Trippy.</h3>
                <p>
                  Your ideas, turned into possibilities.
                  <br />
                  Your group, always in control.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section id="discover" className="discover section">
          <div className="section-heading reveal">
            <div>
              <div className="eyebrow">02 / FOLLOW YOUR KIND OF FEELING</div>
              <h2>Where’s your head at?</h2>
            </div>
            <p>
              A big adventure or a little escape.
              <br />
              There’s a somewhere for every you.
            </p>
          </div>
          <div className="filter-row">
            <div
              className="filters"
              role="group"
              aria-label="Filter trips by mood"
            >
              {["All moods", "Adventure", "Culture", "Unwind"].map((f, i) => (
                <button
                  className={filter === f ? "filter active" : "filter"}
                  aria-pressed={filter === f}
                  key={f}
                  onClick={() => setFilter(f)}
                >
                  {["✳", "↗", "⌑", "☼"][i]} {f}
                </button>
              ))}
            </div>
            <span className="sample-label">CURATED TRIP INSPIRATION</span>
          </div>
          <div className="trip-grid">
            {filtered.map((t, i) => (
              <article className="trip-card" key={t.id}>
                <div className="trip-photo">
                  <img
                    src={t.image}
                    style={{ objectPosition: t.position }}
                    alt={t.place}
                    loading="lazy"
                  />
                  <span className="trip-type">{t.type}</span>
                  <button
                    className={
                      "save-button " + (saved.includes(t.id) ? "saved" : "")
                    }
                    aria-label={
                      (saved.includes(t.id) ? "Unsave " : "Save ") + t.place
                    }
                    aria-pressed={saved.includes(t.id)}
                    onClick={() => saveTrip(t.id)}
                  >
                    <Icon name="heart" size={19} />
                  </button>
                  <div className="photo-title">
                    {t.title.split("\n").map((line, n) => (
                      <React.Fragment key={line}>
                        {line}
                        {n === 0 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="trip-details">
                  <span className="trip-location">
                    <Icon name="pin" size={14} />
                    {t.place}
                  </span>
                  <div className="trip-meta">
                    <span>
                      {t.days} <span>·</span> {t.people}
                    </span>
                    <button
                      aria-label={
                        "Preview itinerary inspiration for " + t.place
                      }
                      className="circle-button"
                      onClick={() => openTrip(t)}
                    >
                      <Icon name="diagonal" />
                    </button>
                  </div>
                  <div className="trip-tags">
                    {t.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="discover-footer">
            <span>No perfect itinerary required. Just a little curiosity.</span>
            <a className="text-link" href="/app?create=1">
              Start planning a trip <Icon name="diagonal" size={17} />
            </a>
          </div>
        </section>
        <section id="trippy" className="trippy-section">
          <div className="trippy-inner">
            <div className="trippy-copy reveal">
              <div className="eyebrow">
                <span className="trippy-star">✳</span> 03 / MEET YOUR +1
              </div>
              <h2>
                The group chat.
                <br />
                With a <em>plot twist.</em>
              </h2>
              <p>
                Meet Trippy. Tag your travel sidekick to find a hidden gem,
                untangle everyone’s ideas, or turn “what if” into an actual
                plan.
              </p>
              <p className="trippy-quiet">
                Trippy proposes. Your people decide.
              </p>
              <a href="#decision-preview" className="button terra">
                Try the voting preview <Icon name="arrow" />
              </a>
              <div className="trippy-fine">
                GOOD IDEAS NEED COMPANY. SO DO GOOD PLANS.
              </div>
            </div>
            <div id="decision-preview" className="demo-scene reveal">
              <span className="demo-kicker">
                TRY IT · INTERACTIVE PRODUCT PREVIEW
              </span>
              <div className="chat-window">
                <div className="chat-header">
                  <div className="group-icon">☀</div>
                  <div>
                    <strong>The scenic route club</strong>
                    <span>4 friends · one shared adventure</span>
                  </div>
                  <span className="chat-dots">•••</span>
                </div>
                <div className="chat-body">
                  <div className="message">
                    <span className="avatar coral">A</span>
                    <div>
                      <span className="sender">
                        Ananya <small>10:42</small>
                      </span>
                      <p>Culture in the morning, something chill after? ☀️</p>
                    </div>
                  </div>
                  <div className="message own">
                    <div>
                      <p>
                        <b>@Trippy</b> find us a sunset spot after Ellora?
                      </p>
                      <span className="sent-label">You · 10:43</span>
                    </div>
                  </div>
                  <div className="message agent">
                    <span className="avatar green">✳</span>
                    <div>
                      <span className="sender">
                        Trippy <span className="agent-label">YOUR +1</span>
                      </span>
                      <p>
                        A quiet sunset stop sounds like your crew. Shall we add
                        it to the plan?
                      </p>
                      <div className={"proposal " + (voted ? "committed" : "")}>
                        <span className="proposal-time">
                          <Icon name="sun" size={16} /> DAY 2 · 5:30 PM
                        </span>
                        <strong>A golden-hour detour</strong>
                        <span className="proposal-sub">
                          Slow down. Take it all in. Together.
                        </span>
                        <div className="vote-avatars">
                          <span>A</span>
                          <span>R</span>
                          {voted && <span>Y</span>}
                          <small>
                            {voted ? "3 of 4 voted yes" : "2 of 4 voted yes"}
                          </small>
                        </div>
                        <button
                          onClick={() => setVoted(!voted)}
                          className="vote-button"
                        >
                          <Icon name={voted ? "lock" : "check"} size={15} />
                          {voted
                            ? "Committed & locked · reset preview"
                            : "I’m in — cast the deciding vote"}
                          <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="demo-status" aria-live="polite">
                  <span
                    className={
                      voted ? "status-dot committed-dot" : "status-dot"
                    }
                  />
                  {voted
                    ? "Added to the preview plan. Changes need a new proposal."
                    : "Your vote can turn a possibility into a plan."}
                </div>
              </div>
              <div className={"floating-note " + (voted ? "confirmed" : "")}>
                <Icon name={voted ? "lock" : "people"} size={17} />
                <span>
                  {voted
                    ? "A shared yes. A preview plan."
                    : "Less “any updates?”\nMore “see you there.”"}
                </span>
              </div>
            </div>
          </div>
        </section>
        <section id="passport" className="passport section reveal">
          <div className="passport-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="orbit-star">✳</span>
            <div className="passport-float">
              <div className="passport-book">
                <div className="passport-book-top">
                  <Mark />
                  <span>
                    CONVIA
                    <br />
                    TRAVEL PASSPORT
                  </span>
                </div>
                <div className="passport-emblem">
                  <Icon name="sun" size={54} />
                  <span>
                    THE WORLD
                    <br />
                    IS YOUR KIND OF PLACE
                  </span>
                </div>
                <div className="passport-bottom">
                  CURIOUS BY NATURE.
                  <br />
                  OPEN TO POSSIBILITY.<span>↗</span>
                </div>
              </div>
            </div>
            <span className="passport-sticker">
              SLOW MORNINGS
              <br />
              BIG ADVENTURES
              <br />
              YOUR OWN PACE ↗
            </span>
          </div>
          <div className="passport-copy">
            <div className="eyebrow">
              04 / LESS SMALL TALK. MORE CONNECTION.
            </div>
            <h2>
              Your vibe.
              <br />
              Your <em>travel passport.</em>
            </h2>
            <p>
              Early bird or “one more coffee”? Hidden trails or hidden cafés?
              Tell us what makes a trip yours. We’ll help you find a group that
              gets it.
            </p>
            <div className="passport-options">
              <span>
                <Icon name="check" size={16} /> Import travel preferences
              </span>
              <span>
                <Icon name="check" size={16} /> Set your pace & budget
              </span>
              <span>
                <Icon name="check" size={16} /> Or just start exploring
              </span>
            </div>
            <a className="button dark" href="/app?view=passport">
              Build my travel Passport <Icon name="diagonal" size={18} />
            </a>
            <small>Optional, always. You’re more than an algorithm.</small>
          </div>
        </section>
        <section className="closing reveal">
          <span className="eyebrow">YOUR NEXT “REMEMBER WHEN” IS WAITING.</span>
          <h2>
            Go somewhere.
            <br />
            <em>Belong somewhere.</em>
            <span>✳</span>
          </h2>
          <a className="button dark" href="/app?create=1">
            Start planning a trip <Icon name="diagonal" />
          </a>
          <div className="closing-coordinates">
            NEW PLACES. YOUR PEOPLE. ALL THE POSSIBILITIES.
          </div>
        </section>
      </main>
      <footer>
        <a href="#" className="brand">
          <Mark />
          convia
        </a>
        <span>Made for the way we go together.</span>
        <div>
          <a href="#discover">Explore</a>
          <a href="#together">Our way</a>
          <button onClick={() => setModal("about")}>About this preview</button>
        </div>
        <span className="footer-note">PACMEN · WANDERMATCH 2026</span>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="modal-close circle-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <Icon name="close" />
            </button>
            {modal === "trip" && selected && (
              <>
                <img
                  className="modal-cover"
                  src={selected.image}
                  alt={selected.place}
                />
                <div className="modal-content">
                  <div className="eyebrow">
                    TRIP INSPIRATION · NOT A LIVE GROUP
                  </div>
                  <h2 id="dialog-title">{selected.place}</h2>
                  <p>{selected.caption}</p>
                  <ol className="sample-itinerary">
                    {selected.itinerary.map((s, i) => (
                      <li key={s}>
                        <span>0{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  <a className="button dark" href="/app?create=1">
                    Start planning a trip <Icon name="arrow" />
                  </a>
                </div>
              </>
            )}
            {modal === "about" && (
              <div className="modal-content">
                <div className="eyebrow">BUILT BY PACMEN</div>
                <h2 id="dialog-title">A first look at Convia.</h2>
                <p>
                  This is the interactive landing experience for our WanderMatch
                  build. Trip cards are inspiration and the voting interaction
                  is a local demonstration. Sign in to create or join real
                  shared trips.
                </p>
                <p>
                  Accounts, travel Passports, shared calendars and group voting
                  are available in the app. Trippy requires a configured server
                  connection. Temple art is an AI-generated artistic
                  interpretation of Kailasa.
                </p>
                <button className="button dark" onClick={() => setModal(null)}>
                  Back to the possibilities <Icon name="arrow" />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
