import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAnswer, diffWords, gradeAttempt } from "../ui/dictation.js";

test("normalize lowercases and folds whitespace", () => {
  assert.equal(normalizeAnswer("  Every   NIGHT "), "every night");
});

test("normalize strips punctuation", () => {
  assert.equal(
    normalizeAnswer("Hello, world! How are you?"),
    "hello world how are you",
  );
});

test("normalize keeps apostrophes inside contractions", () => {
  assert.equal(normalizeAnswer("Don't stop, it's fine."), "don't stop it's fine");
});

test("normalize folds curly quotes; standalone quotes drop, contractions keep", () => {
  assert.equal(normalizeAnswer("‘quote’ “marks”"), "quote marks");
  assert.equal(normalizeAnswer("it’s fine"), "it's fine");
});

test("normalize handles empty and null input", () => {
  assert.equal(normalizeAnswer(""), "");
  assert.equal(normalizeAnswer("   "), "");
  assert.equal(normalizeAnswer(null), "");
});

test("normalize NFKC folds fullwidth digits", () => {
  assert.equal(normalizeAnswer("２０２６"), "2026");
});

test("diff identical text is all equal", () => {
  const ops = diffWords("the brain begins", "the  brain begins");
  assert.ok(ops.every((op) => op.type === "equal"));
  assert.equal(ops.length, 3);
});

test("diff flags a wrong word as delete+insert", () => {
  const ops = diffWords("the brain begins", "the brane begins");
  const wrong = ops.filter((op) => op.type !== "equal");
  assert.deepEqual(
    wrong.map((op) => op.type).sort(),
    ["delete", "insert"],
  );
  assert.equal(wrong.find((op) => op.type === "delete").expected, "brain");
  assert.equal(wrong.find((op) => op.type === "insert").actual, "brane");
});

test("diff missing word yields delete", () => {
  const ops = diffWords("your brain begins a journey", "your begins a journey");
  const deletes = ops.filter((op) => op.type === "delete");
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].expected, "brain");
});

test("diff extra word yields insert", () => {
  const ops = diffWords("scientists disagree", "scientists often disagree");
  const inserts = ops.filter((op) => op.type === "insert");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].actual, "often");
});

test("diff word order swap pairs delete+insert", () => {
  const ops = diffWords("dreams and memories", "memories and dreams");
  assert.ok(ops.some((op) => op.type === "delete"));
  assert.ok(ops.some((op) => op.type === "insert"));
});

test("grade accepts punctuation and case differences", () => {
  const result = gradeAttempt(
    "Every night, you close your eyes.",
    "every night you close your eyes",
  );
  assert.equal(result.correct, true);
});

test("grade rejects missing and wrong words", () => {
  assert.equal(gradeAttempt("the brain begins", "the begins").correct, false);
  assert.equal(gradeAttempt("the brain begins", "the brane begins").correct, false);
  assert.equal(gradeAttempt("the brain", "the brain extra").correct, false);
});

test("grade counts expected and typed words", () => {
  const result = gradeAttempt("your brain begins a journey", "your begins journey");
  assert.equal(result.expectedWords, 5);
  assert.equal(result.typedWords, 3);
});

test("grade empty attempt fails against non-empty line", () => {
  const result = gradeAttempt("scientists disagree", "");
  assert.equal(result.correct, false);
  assert.equal(result.typedWords, 0);
});

test("grade empty line and empty attempt is correct", () => {
  assert.equal(gradeAttempt("", "").correct, true);
});
