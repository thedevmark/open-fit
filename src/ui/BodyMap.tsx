import { useState } from "react";
import { MUSCLE_LABEL, MUSCLES, muscleStatus, type MuscleStatus } from "../lib/logic";
import type { Muscle } from "../lib/types";

// Low-poly front/back figures. Each muscle is one or two polygons in a
// 100×176 box; the left/right halves mirror around x = 50.
type Shape = [Muscle | null, string];

const mirror = (pts: string) =>
  pts.split(" ").map((p) => {
    const [x, y] = p.split(",").map(Number);
    return `${100 - x},${y}`;
  }).join(" ");

const pair = (m: Muscle | null, left: string): Shape[] => [[m, left], [m, mirror(left)]];

const FRONT: Shape[] = [
  [null, "38,86 62,86 64,92 36,92"],
  ...pair("side_delts", "24,34 30,30 32,44 26,48"),
  ...pair("front_delts", "30,30 40,28 40,40 32,44"),
  ...pair("chest", "40,29 49,31 49,49 37,51 33,44 40,40"),
  ...pair("biceps", "26,49 33,46 34,64 27,66"),
  ...pair("forearms", "27,68 34,66 32,88 26,89"),
  ["abs", "38,53 62,53 60,85 40,85"],
  ...pair("quads", "36,93 46,93 45,132 37,130 34,108"),
  ...pair("adductors", "46,93 49.5,93 49.5,110 45,124"),
  ...pair("calves", "37,136 45,136 44,170 39,170"),
];

const BACK: Shape[] = [
  ["traps", "42,22 58,22 66,31 58,37 50,43 42,37 34,31"],
  ...pair("rear_delts", "24,34 34,31 34,44 26,48"),
  ["upper_back", "40,38 50,44 60,38 62,51 50,56 38,51"],
  ...pair("lats", "34,45 38,53 49.5,58 44,74 38,72 35,58"),
  ["lower_back", "45,74 50,60 55,74 58,85 42,85"],
  ...pair("triceps", "26,49 34,46 34,64 27,66"),
  ...pair("forearms", "27,68 34,66 32,88 26,89"),
  ["glutes", "37,87 63,87 65,104 50,108 35,104"],
  ...pair("hamstrings", "35,107 49.5,110 47,134 37,132"),
  ...pair("calves", "36,136 46,136 44,170 38,170"),
];

const STATUS_LABEL: Record<MuscleStatus, string> = { fresh: "Fresh", recovering: "Recovering", fatigued: "Fatigued" };

export default function BodyMap({ scores, threshold }: { scores: Record<Muscle, number>; threshold: number }) {
  const [picked, setPicked] = useState<Muscle | null>(null);
  const status = (m: Muscle) => muscleStatus(scores[m] ?? 0, threshold);
  const flagged = MUSCLES.filter((m) => status(m) !== "fresh").sort((a, b) => scores[b] - scores[a]);

  const figure = (shapes: Shape[], label: string) => (
    <figure className="fit-body__fig">
      <svg viewBox="0 0 100 176" role="img" aria-label={`${label} muscle map`}>
        <circle cx="50" cy="13" r="8.5" className="fit-body__neutral" />
        <rect x="46" y="21" width="8" height="7" className="fit-body__neutral" />
        {shapes.map(([m, pts], i) =>
          m ? (
            <polygon
              key={i}
              points={pts}
              className={`fit-body__m is-${status(m)}${picked === m ? " is-picked" : ""}`}
              onClick={() => setPicked(picked === m ? null : m)}
            >
              <title>{`${MUSCLE_LABEL[m]}: ${STATUS_LABEL[status(m)].toLowerCase()}`}</title>
            </polygon>
          ) : (
            <polygon key={i} points={pts} className="fit-body__neutral" />
          ),
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );

  return (
    <section className="fit-body" aria-label="Recovery">
      <div className="fit-body__figs">
        {figure(FRONT, "Front")}
        {figure(BACK, "Back")}
      </div>
      <div className="fit-body__side">
        <ul className="fit-legend">
          {(["fresh", "recovering", "fatigued"] as const).map((s) => (
            <li key={s}><i className={`is-${s}`} aria-hidden="true" />{STATUS_LABEL[s]}</li>
          ))}
        </ul>
        {picked ? (
          <p className="fit-body__picked">
            <strong>{MUSCLE_LABEL[picked]}</strong> {STATUS_LABEL[status(picked)].toLowerCase()} · {scores[picked].toFixed(1)} / {threshold}
          </p>
        ) : null}
        {flagged.length ? (
          <ul className="fit-body__list">
            {flagged.map((m) => (
              <li key={m}>
                <span>{MUSCLE_LABEL[m]}</span>
                <span className={`fit-tag is-${status(m)}`}>{STATUS_LABEL[status(m)]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fit-body__all">Everything&apos;s fresh.</p>
        )}
      </div>
    </section>
  );
}
