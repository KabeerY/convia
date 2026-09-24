import { useEffect, useRef, useState } from "react";

const chapters = [
  "The invitation",
  "Open the possibilities",
  "A whole new world",
];
const clamp = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function DoorPanels({ side }) {
  const key = `palace-${side}`;
  const lotus = (x, y, size = 1) => (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {Array.from({ length: 12 }, (_, i) => (
        <path
          key={i}
          transform={`rotate(${i * 30})`}
          d="M0 0C-19-13-22-37 0-57 22-37 19-13 0 0Z"
          fill={`url(#${key}-gold)`}
          stroke="#402d1c"
          strokeWidth="2"
        />
      ))}
      <circle
        r="17"
        fill={`url(#${key}-gold)`}
        stroke="#3b2819"
        strokeWidth="3"
      />
      <circle r="9" fill="#345d55" stroke="#d0a963" strokeWidth="2" />
    </g>
  );
  const arch =
    "M54 565V225Q54 200 78 191Q57 153 98 139Q85 105 129 103Q139 73 170 82L200 48 230 82Q261 73 271 103Q315 105 302 139Q343 153 322 191Q346 200 346 225V565Z";
  return (
    <svg
      className="door-panels"
      viewBox="0 0 400 720"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${key}-wood`} x1="0" y1="0" x2="1" y2=".3">
          <stop stopColor="#261d19" />
          <stop offset=".22" stopColor="#71432c" />
          <stop offset=".5" stopColor="#482d22" />
          <stop offset=".78" stopColor="#67412b" />
          <stop offset="1" stopColor="#241b16" />
        </linearGradient>
        <linearGradient id={`${key}-gold`} x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="#e4c28a" />
          <stop offset=".18" stopColor="#b78a49" />
          <stop offset=".48" stopColor="#77512b" />
          <stop offset=".65" stopColor="#cda769" />
          <stop offset="1" stopColor="#624322" />
        </linearGradient>
        <radialGradient id={`${key}-inlay`}>
          <stop stopColor="#517569" />
          <stop offset=".7" stopColor="#29483e" />
          <stop offset="1" stopColor="#142c26" />
        </radialGradient>
        <filter
          id={`${key}-relief`}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="2"
            floodColor="#0c0906"
            floodOpacity=".9"
          />
          <feDropShadow
            dx="-1"
            dy="-1"
            stdDeviation=".35"
            floodColor="#e6c48b"
            floodOpacity=".45"
          />
        </filter>
        <filter id={`${key}-grain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".16 .025"
            numOctaves="3"
            seed={side === "left" ? 6 : 12}
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <pattern
          id={`${key}-jali`}
          width="36"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M18 0 36 18 18 36 0 18ZM18 7 29 18 18 29 7 18Z"
            fill="none"
            stroke="#aa8046"
            strokeWidth="1.2"
          />
          <circle cx="18" cy="18" r="2.5" fill="#c3a16a" />
        </pattern>
        <clipPath id={`${key}-arch`}>
          <path d={arch} />
        </clipPath>
      </defs>
      <rect width="400" height="720" fill={`url(#${key}-wood)`} />
      <rect
        x="9"
        y="9"
        width="382"
        height="702"
        fill="none"
        stroke="#171a13"
        strokeWidth="12"
      />
      <rect
        x="15"
        y="15"
        width="370"
        height="690"
        fill="none"
        stroke={`url(#${key}-gold)`}
        strokeWidth="5"
      />
      <rect
        x="28"
        y="28"
        width="344"
        height="664"
        fill="none"
        stroke="#ad814a"
        strokeWidth="1.5"
      />
      <g filter={`url(#${key}-relief)`}>
        <path
          d={arch}
          fill={`url(#${key}-inlay)`}
          stroke={`url(#${key}-gold)`}
          strokeWidth="14"
        />
        <path d={arch} fill="none" stroke="#e0b978" strokeWidth="1.4" />
        <g clipPath={`url(#${key}-arch)`}>
          <rect
            x="50"
            y="45"
            width="300"
            height="530"
            fill={`url(#${key}-jali)`}
            opacity=".42"
          />
          <path
            d="M72 541C125 516 105 466 158 449M328 541C275 516 295 466 242 449M78 241C132 224 118 164 166 145M322 241C268 224 282 164 234 145"
            fill="none"
            stroke={`url(#${key}-gold)`}
            strokeWidth="5"
          />
          {[0, 1].map((i) => (
            <g
              key={i}
              transform={i ? "translate(400 0) scale(-1 1)" : undefined}
            >
              {[0, 1, 2].map((j) => (
                <g
                  key={j}
                  transform={`translate(${92 + j * 17} ${507 - j * 22}) rotate(-30)`}
                >
                  <path
                    d="M0 0C-26-5-31-27-27-35-6-32 5-18 0 0ZM0 0C25-8 31-27 26-34 5-29-6-15 0 0Z"
                    fill={`url(#${key}-gold)`}
                  />
                </g>
              ))}
            </g>
          ))}
        </g>
        <circle
          cx="200"
          cy="302"
          r="110"
          fill="#34271c"
          stroke={`url(#${key}-gold)`}
          strokeWidth="9"
        />
        <circle
          cx="200"
          cy="302"
          r="97"
          fill={`url(#${key}-inlay)`}
          stroke="#c5a56e"
          strokeWidth="2"
        />
        {Array.from({ length: 32 }, (_, i) => (
          <circle
            key={i}
            cx={200 + 104 * Math.cos((i * Math.PI) / 16)}
            cy={302 + 104 * Math.sin((i * Math.PI) / 16)}
            r="2.4"
            fill="#ebce94"
          />
        ))}
        {lotus(200, 302, 1.45)}
        {lotus(200, 126, 0.45)}
        {lotus(200, 494, 0.63)}
        <rect
          x="51"
          y="590"
          width="298"
          height="80"
          rx="3"
          fill="#302820"
          stroke={`url(#${key}-gold)`}
          strokeWidth="8"
        />
        {[98, 200, 302].map((x) => (
          <g key={x}>{lotus(x, 630, 0.45)}</g>
        ))}
        {[16, 384].map((x) =>
          Array.from({ length: 15 }, (_, i) => (
            <g key={`${x}-${i}`} transform={`translate(${x} ${40 + i * 46})`}>
              <path d="M0-9 5 0 0 9-5 0Z" fill="#d3ad71" />
              <circle r="2" fill="#403726" />
            </g>
          )),
        )}
        {[52, 348].map((x) =>
          [50, 575, 683].map((y) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="6"
              fill={`url(#${key}-gold)`}
              stroke="#302418"
              strokeWidth="2"
            />
          )),
        )}
      </g>
      <rect
        width="400"
        height="720"
        filter={`url(#${key}-grain)`}
        opacity=".09"
        style={{ mixBlendMode: "soft-light" }}
      />
    </svg>
  );
}

export default function TempleJourney() {
  const trackRef = useRef(null);
  const sceneRef = useRef(null);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const track = trackRef.current,
      scene = sceneRef.current;
    let frame = 0,
      progress = 0,
      target = 0,
      lastTime = 0,
      previousChapter = -1;
    const paint = () => {
      const open = smoothstep((progress - 0.07) / 0.66);
      const arrive = smoothstep((progress - 0.57) / 0.43);
      scene.style.setProperty("--journey", progress.toFixed(4));
      scene.style.setProperty("--door-angle", `${open * 88}deg`);
      scene.style.setProperty("--door-light", (0.95 - open * 0.25).toFixed(3));
      scene.style.setProperty(
        "--intro-opacity",
        (1 - smoothstep((progress - 0.12) / 0.2)).toFixed(3),
      );
      scene.style.setProperty(
        "--arrival-opacity",
        smoothstep((progress - 0.43) / 0.25).toFixed(3),
      );
      scene.style.setProperty("--camera-scale", (1 + arrive * 0.15).toFixed(4));
      scene.style.setProperty("--camera-y", `${arrive * -2}%`);
      scene.style.setProperty(
        "--light-opacity",
        (0.08 + open * 0.25 - arrive * 0.14).toFixed(3),
      );
      scene.style.setProperty("--caption-y", `${(1 - arrive) * 24}px`);
      scene.style.setProperty("--progress", `${progress * 100}%`);
      const nextChapter = progress < 0.25 ? 0 : progress < 0.72 ? 1 : 2;
      if (nextChapter !== previousChapter) {
        previousChapter = nextChapter;
        setChapter(nextChapter);
      }
    };
    const animate = (time) => {
      const elapsed = Math.min(50, time - (lastTime || time - 16));
      lastTime = time;
      progress += (target - progress) * (1 - Math.exp(-elapsed / 80));
      if (Math.abs(target - progress) < 0.0002) progress = target;
      paint();
      frame = progress !== target ? requestAnimationFrame(animate) : 0;
    };
    const measure = () => {
      if (media.matches) {
        target = progress = 1;
        paint();
        return;
      }
      const box = track.getBoundingClientRect();
      target = clamp(
        (18 - box.top) / Math.max(1, box.height - scene.offsetHeight),
      );
      if (!frame) {
        lastTime = 0;
        frame = requestAnimationFrame(animate);
      }
    };
    const initialize = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      measure();
      progress = target;
      paint();
    };
    initialize();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    media.addEventListener("change", initialize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      media.removeEventListener("change", initialize);
    };
  }, []);

  return (
    <div className="temple-journey" ref={trackRef}>
      <section
        className="journey-sticky"
        ref={sceneRef}
        aria-label="A scroll journey through the doors of Kailasa"
      >
        <div className="journey-viewport">
          <div className="temple-camera">
            <div className="temple-image" />
            <div className="temple-atmosphere" />
          </div>
          <div className="sunlight" aria-hidden="true" />
          <div className="doorway" aria-hidden="true">
            <div className="door-leaf door-leaf-left">
              <div className="door-face">
                <DoorPanels side="left" />
                <span className="door-pull" />
              </div>
              <div className="door-thickness" />
            </div>
            <div className="door-leaf door-leaf-right">
              <div className="door-face">
                <DoorPanels side="right" />
                <span className="door-pull" />
              </div>
              <div className="door-thickness" />
            </div>
          </div>
          <div className="gateway-vignette" aria-hidden="true" />
          <div className="journey-top">
            <span>
              <i /> ELLORA, MAHARASHTRA
            </span>
            <a href="#together">
              Skip the journey <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="door-invitation">
            <span className="journey-eyebrow">
              A LITTLE CURIOSITY GOES A LONG WAY.
            </span>
            <h2>
              Some doors open
              <br />
              <em>whole new worlds.</em>
            </h2>
            <span className="invitation-scroll">
              SCROLL TO OPEN <span aria-hidden="true">↓</span>
            </span>
          </div>
          <div className="journey-arrival">
            <span className="journey-eyebrow">KAILASA · YOUR NEXT CHAPTER</span>
            <h2>
              Walk into wonder.
              <br />
              <em>Bring your people.</em>
            </h2>
            <p>
              A thousand stories carved in stone.
              <br />
              And a little room for yours.
            </p>
          </div>
          <div className="journey-footer">
            <span className="chapter-label">
              <b>0{chapter + 1}</b> / {chapters[chapter]}
            </span>
            <div className="journey-progress" aria-hidden="true">
              <span />
            </div>
            <span className="journey-coordinates">20.0238° N · 75.1790° E</span>
          </div>
          <span className="journey-art-note">
            KAILASA · ARTISTIC INTERPRETATION
          </span>
        </div>
      </section>
    </div>
  );
}
