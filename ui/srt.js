// Tolerant SRT parser for Echo.
// Accepts the messy real-world SRT variants described in docs/architecture.md:
// BOM, CRLF, dot milliseconds, missing cue index, multiline text, inline HTML
// tags, overlapping cues, and malformed blocks (skipped with a warning).

function parseSrtTime(value) {
  const match = String(value)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) return null;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function decodeSrtEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}

function cleanSrtText(rawText) {
  return decodeSrtEntities(rawText.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function parseSrt(input) {
  const warnings = [];
  const segments = [];
  if (typeof input !== "string") {
    return { segments, warnings };
  }

  const blocks = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (!lines.length) return;

    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) {
      const isStrayIndexLine =
        lines.length === 1 && /^\d+$/.test(lines[0].trim());
      if (!isStrayIndexLine) {
        warnings.push(`block ${blockIndex + 1}: missing timing line`);
      }
      return;
    }

    const [rawStart, rawEnd] = lines[timingIndex].split("-->");
    const start = parseSrtTime(rawStart);
    let end = parseSrtTime(rawEnd);
    if (start === null || end === null) {
      warnings.push(`block ${blockIndex + 1}: invalid timestamp`);
      return;
    }
    if (end < start) {
      warnings.push(`block ${blockIndex + 1}: end before start, swapped`);
      end = start;
    }

    const text = cleanSrtText(lines.slice(timingIndex + 1).join(" "));
    if (!text) {
      warnings.push(`block ${blockIndex + 1}: empty text`);
      return;
    }

    segments.push({ start, end, text });
  });

  segments.sort((a, b) => a.start - b.start || a.end - b.end);
  return { segments, warnings };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSrt };
}
