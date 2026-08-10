import assert from "node:assert/strict";
import test from "node:test";

import {
  findCanonicalClassFindings,
  loadProjectDesignSystem
} from "./check-tailwind-canonical-classes.mjs";

const designSystem = await loadProjectDesignSystem();

test("reports non-canonical Tailwind classes with their variants", () => {
  const source = `const classes = "h-[28px] dark:h-[28px] w-(--anchor-width)";`;

  assert.deepEqual(
    findCanonicalClassFindings(source, "fixture.tsx", designSystem),
    [
      {
        candidate: "h-[28px]",
        canonical: "h-7",
        file: "fixture.tsx",
        line: 1
      },
      {
        candidate: "dark:h-[28px]",
        canonical: "dark:h-7",
        file: "fixture.tsx",
        line: 1
      }
    ]
  );
});

test("accepts canonical and project-supported Tailwind classes", () => {
  const source = `const classes = "h-7 dark:h-7 w-(--anchor-width)";`;

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
