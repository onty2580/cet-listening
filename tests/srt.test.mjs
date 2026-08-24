import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseSrt } = require("../ui/srt.js");

function srt(...blocks) {
  return blocks.join("\n\n") + "\n";
}

test("parses a well-formed file with cue indexes", () => {
  const { segments, warnings } = parseSrt(
    srt(
      "1\n00:00:01,000 --> 00:00:04,000\nHello there.",
      "2\n00:00:05,500 --> 00:00:08,250\nGeneral Kenobi!",
    ),
  );
  assert.equal(warnings.length, 0);
  assert.deepEqual(segments, [
    { start: 1, end: 4, text: "Hello there." },
    { start: 5.5, end: 8.25, text: "General Kenobi!" },
  ]);
});

test("handles CRLF line endings and BOM", () => {
  const raw = "﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nLine one.\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nLine two.";
  const { segments, warnings } = parseSrt(raw);
  assert.equal(warnings.length, 0);
  assert.deepEqual(segments.map((s) => s.text), ["Line one.", "Line two."]);
});

test("joins multiline cues into one segment text", () => {
  const { segments } = parseSrt(
    srt("1\n00:00:01,000 --> 00:00:04,000\nThis cue spans\ntwo lines in the file."),
  );
  assert.deepEqual(segments, [
    { start: 1, end: 4, text: "This cue spans two lines in the file." },
  ]);
});

test("strips inline HTML tags and decodes entities", () => {
  const { segments } = parseSrt(
    srt("1\n00:00:01,000 --> 00:00:04,000\n<i>She said</i> \"go\" &amp; <font color=\"#fff\">left</font>."),
  );
  assert.equal(segments[0].text, `She said "go" & left.`);
});

test("accepts dot milliseconds and short MM:SS form", () => {
  const { segments, warnings } = parseSrt(
    srt("1\n00:01.5 --> 00:03.25\nShort form."),
  );
  assert.equal(warnings.length, 0);
  assert.equal(segments[0].start, 1.5);
  assert.equal(segments[0].end, 3.25);
});

test("skips empty-text cues with a warning", () => {
  const { segments, warnings } = parseSrt(
    srt("1\n00:00:01,000 --> 00:00:02,000\nKeep.", "2\n00:00:03,000 --> 00:00:04,000"),
  );
  assert.equal(segments.length, 1);
  assert.ok(warnings[0].includes("empty text"));
});

test("skips malformed blocks without timing and warns", () => {
  const { segments, warnings } = parseSrt(
    srt("1\n00:00:01,000 --> 00:00:02,000\nGood.", "not a real cue at all"),
  );
  assert.equal(segments.length, 1);
  assert.ok(warnings[0].includes("missing timing line"));
});

test("tolerates a stray numeric index line with no content", () => {
  const { segments, warnings } = parseSrt(srt("1\n00:00:01,000 --> 00:00:02,000\nGood.", "42"));
  assert.equal(segments.length, 1);
  assert.equal(warnings.length, 0);
});

test("sorts out-of-order cues by start time", () => {
  const { segments } = parseSrt(
    srt(
      "1\n00:00:10,000 --> 00:00:12,000\nSecond.",
      "2\n00:00:01,000 --> 00:00:03,000\nFirst.",
    ),
  );
  assert.deepEqual(segments.map((s) => s.text), ["First.", "Second."]);
});

test("keeps overlapping cues in sorted order", () => {
  const { segments, warnings } = parseSrt(
    srt(
      "1\n00:00:01,000 --> 00:00:05,000\nLong cue.",
      "2\n00:00:03,000 --> 00:00:04,000\nOverlaps it.",
    ),
  );
  assert.equal(warnings.length, 0);
  assert.deepEqual(segments.map((s) => s.start), [1, 3]);
});

test("swaps inverted timestamps instead of dropping the cue", () => {
  const { segments, warnings } = parseSrt(
    srt("1\n00:00:05,000 --> 00:00:02,000\nInverted."),
  );
  assert.equal(segments[0].start, 5);
  assert.equal(segments[0].end, 5);
  assert.ok(warnings[0].includes("swapped"));
});

test("returns empty result for non-string input", () => {
  assert.deepEqual(parseSrt(null), { segments: [], warnings: [] });
});
