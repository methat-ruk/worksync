import assert from "node:assert/strict";
import test from "node:test";

import {
  findCanonicalClassFindings,
  loadProjectDesignSystem
} from "./check-tailwind-canonical-classes.mjs";

const designSystem = await loadProjectDesignSystem();
// Keep fixture candidates split so Tailwind's source scanner cannot emit them
// into the production stylesheet merely because this regression test is tracked.
const arbitraryHeight = ["h-", "[28px]"].join("");
const canonicalHeight = ["h", "-7"].join("");
const darkArbitraryHeight = ["dark:", arbitraryHeight].join("");
const darkCanonicalHeight = ["dark:", canonicalHeight].join("");
const anchorWidth = ["w-", "(--anchor-width)"].join("");

test("reports non-canonical Tailwind classes with their variants", () => {
  const source = `const classes = "${[
    arbitraryHeight,
    darkArbitraryHeight,
    anchorWidth
  ].join(" ")}";`;

  assert.deepEqual(
    findCanonicalClassFindings(source, "fixture.tsx", designSystem),
    [
      {
        candidate: arbitraryHeight,
        canonical: canonicalHeight,
        file: "fixture.tsx",
        line: 1
      },
      {
        candidate: darkArbitraryHeight,
        canonical: darkCanonicalHeight,
        file: "fixture.tsx",
        line: 1
      }
    ]
  );
});

test("accepts canonical and project-supported Tailwind classes", () => {
  const source = `const classes = "${[
    canonicalHeight,
    darkCanonicalHeight,
    anchorWidth
  ].join(" ")}";`;

  assert.deepEqual(
    findCanonicalClassFindings(source, "fixture.tsx", designSystem),
    []
  );
});

test("ignores ordinary source strings that are not Tailwind candidates", () => {
  const source = `throw new Error("Internal server error");`;

  assert.deepEqual(
    findCanonicalClassFindings(source, "fixture.ts", designSystem),
    []
  );
});
