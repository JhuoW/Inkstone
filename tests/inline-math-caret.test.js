import test from "node:test";
import assert from "node:assert/strict";
import { mathCaretOffset } from "../src/inline-math-caret.js";

const box = (text, left, top = 0) => ({
  text,
  left,
  right: left + 8,
  top,
  bottom: top + 10,
});
const bounds = { left: 0, right: 80 };
test("linear formula glyphs choose exact source positions including whitespace", () => {
  const glyphs = [
    box("a", 0),
    box("=", 12),
    box("b", 24),
    box("+", 36),
    box("c", 48),
  ];
  assert.equal(mathCaretOffset("a = b+c", glyphs, { x: 25, y: 5 }, bounds), 4);
  assert.equal(mathCaretOffset("a = b+c", glyphs, { x: 31, y: 5 }, bounds), 5);
  assert.equal(mathCaretOffset("a = b+c", glyphs, { x: 49, y: 5 }, bounds), 6);
});
test("fraction numerator and denominator map unique symbols using two-dimensional geometry", () => {
  const glyphs = [box("y", 12, 20), box("x", 12, 0)];
  const source = "\\frac{x}{y}";
  assert.equal(
    mathCaretOffset(source, glyphs, { x: 13, y: 5 }, bounds),
    source.indexOf("x"),
  );
  assert.equal(
    mathCaretOffset(source, glyphs, { x: 19, y: 25 }, bounds),
    source.indexOf("y") + 1,
  );
});
test("known TeX command glyphs select command boundaries rather than fabricated glyph offsets", () => {
  const source = "\\alpha + x";
  assert.equal(
    mathCaretOffset(
      source,
      [box("α", 0), box("+", 20), box("x", 32)],
      { x: 1, y: 5 },
      bounds,
    ),
    0,
  );
  assert.equal(
    mathCaretOffset(
      source,
      [box("α", 0), box("+", 20), box("x", 32)],
      { x: 7, y: 5 },
      bounds,
    ),
    6,
  );
});
test("repeated fraction symbols map numerator and denominator groups instead of command characters", () => {
  const cases = [
    {
      source: "\\frac{x}{x}",
      glyphs: [box("x", 12, 20), box("x", 12, 0)],
      points: [
        [13, 5, 6],
        [13, 25, 9],
      ],
    },
    {
      source: "x+\\frac{x}{x}",
      glyphs: [
        box("x", 0, 10),
        box("+", 12, 10),
        box("x", 32, 20),
        box("x", 32, 0),
      ],
      points: [
        [1, 15, 0],
        [33, 5, 8],
        [33, 25, 11],
      ],
    },
    {
      source: "\\frac{x}{xx}",
      glyphs: [box("x", 20, 0), box("x", 12, 20), box("x", 24, 20)],
      points: [
        [21, 5, 6],
        [13, 25, 9],
        [25, 25, 10],
      ],
    },
  ];
  for (const { source, glyphs, points } of cases)
    for (const [x, y, offset] of points)
      assert.equal(
        mathCaretOffset(source, glyphs, { x, y }, bounds),
        offset,
        `${source} at ${x},${y}`,
      );
});
test("nested fractions, roots and superscripts retain repeated symbol source positions", () => {
  const nested = "\\frac{\\frac{x}{x}}{x}";
  const occurrences = [...nested.matchAll(/x/g)].map((match) => match.index);
  const glyphs = [box("x", 12, 40), box("x", 12, 20), box("x", 12, 0)];
  for (let index = 0; index < occurrences.length; index++)
    assert.equal(
      mathCaretOffset(nested, glyphs, { x: 13, y: index * 20 + 5 }, bounds),
      occurrences[index],
    );
  assert.equal(
    mathCaretOffset(
      "x^x",
      [box("x", 12, 0), box("x", 0, 15)],
      { x: 13, y: 5 },
      bounds,
    ),
    2,
  );
  assert.equal(
    mathCaretOffset(
      "x^x",
      [box("x", 12, 0), box("x", 0, 15)],
      { x: 1, y: 20 },
      bounds,
    ),
    0,
  );
  assert.equal(
    mathCaretOffset(
      "\\sqrt{x}+x",
      [box("x", 12), box("+", 28), box("x", 40)],
      { x: 13, y: 5 },
      bounds,
    ),
    6,
  );
});
test("ambiguous or path-only math stays bounded and never splits surrogate pairs", () => {
  assert.equal(mathCaretOffset("x+x", [], { x: -10, y: 0 }, bounds), 0);
  assert.equal(mathCaretOffset("x+x", [], { x: 100, y: 0 }, bounds), 3);
  assert.equal(mathCaretOffset("🙂", [], { x: 40, y: 0 }, bounds), 2);
});
