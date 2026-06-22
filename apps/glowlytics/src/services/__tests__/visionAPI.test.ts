// FLOW_INTEGRITY_REVIEW #28: the streamed-insights SSE reader had no carry-over
// buffer. An `onprogress` fire that landed mid-line (e.g. `data: {"text": "par`)
// parsed a half-formed JSON line — JSON.parse threw, the error was swallowed,
// and the continuation (`tial"}`) arrived on the next fire WITHOUT the `data: `
// prefix, so it was skipped too. Net effect: a real GPT-4o insight chunk split
// across a network boundary vanished, intermittently downgrading insights to
// local templates.
//
// The fix keeps a string buffer across reader fires: processSseChunk appends the
// chunk, emits only COMPLETE (newline-terminated) lines, and returns the trailing
// partial line for the next fire; parseSseLine flushes the buffer at stream end.
// These tests drive that framing with chunk boundaries that fall MID-LINE.
import { parseSseLine, processSseChunk } from '../visionAPI';

/**
 * Mirrors exactly what streamInsights' reader does: feed each chunk through
 * processSseChunk carrying the buffer forward, then flush a complete trailing
 * line that arrived without a final newline (the onload/onabort flush path).
 */
function drainStream(chunks: string[]): string[] {
  const emitted: string[] = [];
  const onText = (t: string) => emitted.push(t);
  let buffer = '';
  for (const chunk of chunks) {
    buffer = processSseChunk(buffer, chunk, onText);
  }
  if (buffer) parseSseLine(buffer, onText);
  return emitted;
}

/**
 * Reproduces the PRE-FIX framing: each fire split its own slice on '\n' with no
 * carry-over, so a line spanning two fires was parsed half-formed (and dropped)
 * and its continuation lost the `data: ` prefix (and was skipped). Used as a
 * regression guard to prove the new framing actually changes behaviour.
 */
function legacyDrain(chunks: string[]): string[] {
  const emitted: string[] = [];
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) emitted.push(parsed.text);
      } catch {
        /* dropped — this is the bug */
      }
    }
  }
  return emitted;
}

describe('visionAPI SSE framing (bug #28: chunk-boundary carry-over)', () => {
  it('reassembles a data: line split mid-JSON across two chunks', () => {
    // Boundary falls inside the JSON value, per the review's example shape.
    const chunks = ['data: {"text": "partial-', 'value"}\n'];
    expect(drainStream(chunks)).toEqual(['partial-value']);
  });

  it('reassembles a line split inside the `data: ` prefix itself', () => {
    const chunks = ['da', 'ta: {"text": "x"}\n'];
    expect(drainStream(chunks)).toEqual(['x']);
  });

  it('reassembles a single message split across three chunks', () => {
    const chunks = ['data: {"te', 'xt": "hel', 'lo world"}\n'];
    expect(drainStream(chunks)).toEqual(['hello world']);
  });

  it('flushes a complete trailing line that arrives without a final newline', () => {
    // Stream ends mid-line with no '\n'; the onload/onabort flush must emit it.
    const chunks = ['data: {"text": "a"}\ndata: {"text": "fin', 'al"}'];
    expect(drainStream(chunks)).toEqual(['a', 'final']);
  });

  it('leaves a clean multi-line stream unaffected and honours [DONE]', () => {
    const chunks = ['data: {"text": "a"}\ndata: {"text": "b"}\ndata: [DONE]\n'];
    expect(drainStream(chunks)).toEqual(['a', 'b']);
  });

  it('handles a clean stream delivered one full line per chunk', () => {
    const chunks = ['data: {"text": "a"}\n', 'data: {"text": "b"}\n'];
    expect(drainStream(chunks)).toEqual(['a', 'b']);
  });

  it('strips CRLF line endings and ignores blank separator lines', () => {
    const chunks = ['data: {"text": "a"}\r\n\r\n', 'data: {"text": "b"}\r\n'];
    expect(drainStream(chunks)).toEqual(['a', 'b']);
  });

  it('skips malformed JSON without dropping subsequent valid lines', () => {
    const chunks = ['data: {bad json}\ndata: {"text": "ok"}\n'];
    expect(drainStream(chunks)).toEqual(['ok']);
  });

  it('regression guard: pre-fix per-chunk framing drops the split line, new framing keeps it', () => {
    const chunks = ['data: {"text": "partial-', 'value"}\n'];
    expect(legacyDrain(chunks)).toEqual([]); // the bug: message lost
    expect(drainStream(chunks)).toEqual(['partial-value']); // the fix: preserved
  });
});
