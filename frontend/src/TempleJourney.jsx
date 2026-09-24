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

function DoorCarving({ side }) {
  const patternId = `carving-${side}`;
  return (
    <svg
      className="door-carving"
      viewBox="0 0 400 720"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M20 2 38 20 20 38 2 20Z M20 11 29 20 20 29 11 20Z"
            fill="none"
            stroke="currentColor"
            strokeWidth=".7"
          />
          <circle cx="20" cy="20" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <path
        className="carved-line"
        d="M32 681V210C32 105 120 83 200 32c80 51 168 73 168 178v471Z"
      />
      <path
        className="carved-line"
        d="M49 663V216c0-92 79-115 151-163 72 48 151 71 151 163v447Z"
      />
      <path
        d="M65 646V219c0-79 71-102 135-146 64 44 135 67 135 146v427Z"
        fill={`url(#${patternId})`}
        opacity=".42"
      />
      <path
        className="carved-line"
        d="M65 520h270M65 537h270M82 562h236v62H82Z"
      />
      <g transform="translate(200 300)">
        <circle r="72" className="carved-line" />
        <circle r="63" className="carved-line" />
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-25"
            rx="11"
            ry="32"
            transform={`rotate(${i * 30})`}
            className="carved-line"
          />
        ))}
        <circle r="15" className="carved-line" />
        <circle r="6" fill="currentColor" />
      </g>
      {[117, 200, 283].map((x) => (
        <g key={x} transform={`translate(${x} 594)`}>
          <path d="m0-16 16 16L0 16-16 0Z" className="carved-line" />
          <circle r="4" fill="currentColor" />
        </g>
      ))}
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
      scene.style.setProperty("--door-angle", `${8 + open * 99}deg`);
      scene.style.setProperty("--door-light", (0.78 - open * 0.35).toFixed(3));
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
                <DoorCarving side="left" />
                <span className="door-stud stud-top" />
                <span className="door-stud stud-bottom" />
                <span className="door-pull" />
              </div>
              <div className="door-thickness" />
            </div>
            <div className="door-leaf door-leaf-right">
              <div className="door-face">
                <DoorCarving side="right" />
                <span className="door-stud stud-top" />
                <span className="door-stud stud-bottom" />
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
