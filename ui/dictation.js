// Dictation helpers: answer normalization and word-level diff.
// Pure functions, zero dependencies — loaded as a plain script by the
// player (globals) and via module.exports by node:test.

// Collapse an answer to comparable tokens: lowercase, strip punctuation
// (apostrophes inside words survive: don't stays don't), fold whitespace,
// NFKC so fullwidth digits fold to ASCII.
function normalizeAnswer(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .join(" ");
}

// Word-level diff of normalized texts. Returns a list of ops:
//   { type: "equal" | "insert" | "delete", expected?, actual? }
// LCS-based; fine for sentence-length inputs.
function diffWords(expectedText, actualText) {
  const expected = normalizeAnswer(expectedText).split(" ").filter(Boolean);
  const actual = normalizeAnswer(actualText).split(" ").filter(Boolean);

  const rows = expected.length;
  const cols = actual.length;
  const lcs = Array.from({ length: rows + 1 }, () =>
    new Array(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        expected[i] === actual[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (expected[i] === actual[j]) {
      ops.push({ type: "equal", expected: expected[i], actual: actual[j] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "delete", expected: expected[i] });
      i += 1;
    } else {
      ops.push({ type: "insert", actual: actual[j] });
      j += 1;
    }
  }
  while (i < rows) {
    ops.push({ type: "delete", expected: expected[i] });
    i += 1;
  }
  while (j < cols) {
    ops.push({ type: "insert", actual: actual[j] });
    j += 1;
  }
  return ops;
}

// Grade an attempt against the expected line.
//   correct: every expected word present, no extra words
//   ops:     word-level diff for rendering feedback
function gradeAttempt(expectedText, actualText) {
  const ops = diffWords(expectedText, actualText);
  const correct = ops.every((op) => op.type === "equal");
  const expectedWords = ops
    .flatMap((op) => (op.type === "insert" ? [] : [op.expected]))
    .filter(Boolean).length;
  const typedWords = ops
    .flatMap((op) => (op.type === "delete" ? [] : [op.actual]))
    .filter(Boolean).length;
  return { correct, ops, expectedWords, typedWords };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalizeAnswer, diffWords, gradeAttempt };
}
