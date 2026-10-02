// Turns a list of machines (e.g. read off photos of a gym floor) into one
// link that adds them all: open it on the phone, tap "Add all".
//
//   node scripts/machine-link.mjs machines.json [https://deutschmark.online/fit/]
//
// machines.json: [{ "catalog": "cat-leg-ext", "location": "back right" },
//                 { "name": "Odd machine", "exercises": ["shrug"], "location": "…" }]
// Catalog ids are in src/lib/catalog.ts; unknown ones are rejected here,
// before they reach a phone.

import { readFileSync } from "node:fs";
import { CATALOG, encodeMachines } from "../src/lib/catalog.ts";

const [file, base = "http://localhost:5173/"] = process.argv.slice(2);
if (!file) throw new Error("usage: node scripts/machine-link.mjs machines.json [app url]");
const machines = JSON.parse(readFileSync(file, "utf8"));
const known = new Set(CATALOG.map((c) => c.id));
const bad = machines.filter((m) => (m.catalog ? !known.has(m.catalog) : !m.name));
if (bad.length) throw new Error(`not in the catalog / missing a name: ${JSON.stringify(bad)}`);
console.log(`${base}#/add-machines/${encodeMachines(machines)}`);
