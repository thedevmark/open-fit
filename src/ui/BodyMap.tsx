import { useState } from "react";
import { BODY, type BodySide } from "../lib/bodyPaths";
import { MUSCLE_LABEL, MUSCLES, muscleStatus, type MuscleStatus } from "../lib/logic";
import type { Muscle } from "../lib/types";

// Which of our muscles each drawn region stands for. The drawing has one
// deltoid and one upper-back shape, so those regions carry several muscles
// and show the most fatigued of them. Regions not listed (head, hands, knees…)
// are drawn as plain body.
const FRONT: Record<string, Muscle[]> = {
  chest: ["chest"],
  deltoids: ["front_delts", "side_delts"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearm: ["forearms"],
  abs: ["abs"],
  obliques: ["abs"],
  trapezius: ["traps"],
  quadriceps: ["quads"],
  adductors: ["adductors"],
  calves: ["calves"],
};
const BACK: Record<string, Muscle[]> = {
  trapezius: ["traps"],
  deltoids: ["rear_delts", "side_delts"],
  "upper-back": ["lats", "upper_back"],
  "lower-back": ["lower_back"],
  triceps: ["triceps"],
  forearm: ["forearms"],
  gluteal: ["glutes"],
  hamstring: ["hamstrings"],
  adductors: ["adductors"],
  calves: ["calves"],
};

const STATUS_LABEL: Record<MuscleStatus, string> = { fresh: "Fresh", recovering: "Recovering", fatigued: "Needs rest" };

export default function BodyMap({ scores, threshold }: { scores: Record<Muscle, number>; threshold: number }) {
  const [picked, setPicked] = useState<Muscle[] | null>(null);
  const score = (m: Muscle) => scores[m] ?? 0;
  const status = (m: Muscle) => muscleStatus(score(m), threshold);
  const worst = (ms: Muscle[]) => ms.reduce((a, b) => (score(b) > score(a) ? b : a));
  const flagged = MUSCLES.filter((m) => status(m) !== "fresh").sort((a, b) => score(b) - score(a));
  const pickedKey = picked?.join();

  const figure = (side: BodySide, map: Record<string, Muscle[]>, label: string) => (
    <figure className="fit-body__fig">
      <svg viewBox={side.viewBox} role="img" aria-label={`${label} muscle map`}>
        {side.regions.map((r) => {
          const muscles = map[r.slug];
          if (!muscles) return r.d.map((d, i) => <path key={`${r.slug}-${i}`} d={d} className="fit-body__neutral" />);
          const s = status(worst(muscles));
          const key = muscles.join();
          const name = muscles.map((m) => MUSCLE_LABEL[m]).join(" + ");
          return (
            <g
              key={r.slug}
              className={`fit-body__m is-${s}${pickedKey === key ? " is-picked" : ""}`}
              onClick={() => setPicked(pickedKey === key ? null : muscles)}
            >
              <title>{`${name}: ${STATUS_LABEL[s].toLowerCase()}`}</title>
              {r.d.map((d, i) => <path key={i} d={d} />)}
            </g>
          );
        })}
        <path d={side.outline} className="fit-body__outline" />
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );

  return (
    <section className="fit-body" aria-label="Recovery">
      <div className="fit-body__figs">
        {figure(BODY.front, FRONT, "Front")}
        {figure(BODY.back, BACK, "Back")}
      </div>
      <div className="fit-body__side">
        <ul className="fit-legend">
          {(["fresh", "recovering", "fatigued"] as const).map((s) => (
            <li key={s}><i className={`is-${s}`} aria-hidden="true" />{STATUS_LABEL[s]}</li>
          ))}
        </ul>
        {picked ? (
          <ul className="fit-body__picked">
            {picked.map((m) => (
              <li key={m}>
                <strong>{MUSCLE_LABEL[m]}</strong> {STATUS_LABEL[status(m)].toLowerCase()}
              </li>
            ))}
          </ul>
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
