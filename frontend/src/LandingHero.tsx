import { Sun, Sunrise } from "lucide-react";
import PaperPlane from "./PaperPlane";
import SchoolIllustration from "./SchoolIllustration";

export default function LandingHero({
  year,
  shift,
  onShift,
  onExplore,
  onGuide,
}: {
  year: number;
  shift: string;
  onShift: (shift: string) => void;
  onExplore: () => void;
  onGuide: () => void;
}) {
  const period = shift === "Day shift" ? "day" : "morning";
  return (
    <section className="welcome" aria-labelledby="welcome-heading">
      <div className="welcome-copy">
        <div className="eyebrow">A PLACE TO LEARN. A SPACE TO BECOME.</div>
        <h1 id="welcome-heading">
          A bright future
          <br />
          <em>starts here.</em>
        </h1>
        <p>
          Big dreams begin with a small first step.
          <br />
          Find your classroom. Make it your own.
        </p>
        <button className="button button-paper" onClick={onExplore}>
          Find your place <PaperPlane size={20} />
        </button>
        <div className="hero-shifts">
          <span className="shift-prompt">
            Different hours. The same possibilities.
          </span>
          <div
            role="group"
            aria-label="Choose your shift"
            className="hero-shift-options"
          >
            <button
              aria-label="Morning shift"
              aria-pressed={shift === "Morning shift"}
              onClick={() => onShift("Morning shift")}
            >
              <Sunrise size={18} />
              <span>
                Morning shift<small>A fresh start</small>
              </span>
            </button>
            <button
              aria-label="Day shift"
              aria-pressed={shift === "Day shift"}
              onClick={() => onShift("Day shift")}
            >
              <Sun size={18} />
              <span>
                Day shift<small>Your time to shine</small>
              </span>
            </button>
          </div>
        </div>
      </div>
      <div className="welcome-art">
        <SchoolIllustration period={period} />
        <span className="edition-note">A NEW CHAPTER / {year}</span>
      </div>
      <div className="hero-bottom">
        <button onClick={onExplore}>
          <PaperPlane size={16} /> A little scroll. A world of possibilities.
        </button>
        <button onClick={onGuide}>
          How does it all work? <PaperPlane size={15} />
        </button>
      </div>
    </section>
  );
}
