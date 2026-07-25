// CLAUDE-ADDED: Offline dictionary source, alongside the AI lookup in route.ts. Data is the Wordset
// Dictionary (https://github.com/wordset/wordset-dictionary, CC BY-SA 4.0, built on Princeton WordNet) --
// concise per-part-of-speech definitions, well suited to a small e-reader popup rather than a full
// encyclopedic entry. Imported per letter (not the package's own `AllWords` export, which drops every
// word starting with "n" due to a bug in its index.js) so each request only pulls in the ~1-7MB file for
// the word's first letter rather than the ~60MB full dataset.
import a from "wordset-dictionary/data/a.json";
import b from "wordset-dictionary/data/b.json";
import c from "wordset-dictionary/data/c.json";
import d from "wordset-dictionary/data/d.json";
import e from "wordset-dictionary/data/e.json";
import f from "wordset-dictionary/data/f.json";
import g from "wordset-dictionary/data/g.json";
import h from "wordset-dictionary/data/h.json";
import i from "wordset-dictionary/data/i.json";
import j from "wordset-dictionary/data/j.json";
import k from "wordset-dictionary/data/k.json";
import l from "wordset-dictionary/data/l.json";
import m from "wordset-dictionary/data/m.json";
import n from "wordset-dictionary/data/n.json";
import o from "wordset-dictionary/data/o.json";
import p from "wordset-dictionary/data/p.json";
import q from "wordset-dictionary/data/q.json";
import r from "wordset-dictionary/data/r.json";
import s from "wordset-dictionary/data/s.json";
import t from "wordset-dictionary/data/t.json";
import u from "wordset-dictionary/data/u.json";
import v from "wordset-dictionary/data/v.json";
import w from "wordset-dictionary/data/w.json";
import x from "wordset-dictionary/data/x.json";
import y from "wordset-dictionary/data/y.json";
import z from "wordset-dictionary/data/z.json";

interface WordsetMeaning {
  def: string;
  example?: string;
  speech_part?: string;
}

interface WordsetEntry {
  word: string;
  meanings?: WordsetMeaning[];
}

type WordsetFile = Record<string, WordsetEntry>;

const FILES_BY_LETTER: Record<string, WordsetFile> = {
  a, b, c, d, e, f, g, h, i, j, k, l, m,
  n, o, p, q, r, s, t, u, v, w, x, y, z
} as Record<string, WordsetFile>;

const MAX_MEANINGS = 3;

// CLAUDE-ADDED: Only single words are keyed in this dataset -- a multi-word selection can never match,
// so callers should skip straight to the AI source for phrases rather than paying for a lookup that will
// always miss.
export function lookUpOffline(text: string): string | null {
  const word = text.trim().toLowerCase();
  const letter = word[0];
  if (!letter || !FILES_BY_LETTER[letter]) return null;

  const entry = FILES_BY_LETTER[letter][word];
  if (!entry?.meanings?.length) return null;

  return entry.meanings
    .slice(0, MAX_MEANINGS)
    .map(meaning => {
      const pos = meaning.speech_part ? `(${meaning.speech_part}) ` : "";
      const example = meaning.example ? ` — "${meaning.example}"` : "";
      return `${pos}${meaning.def}${example}`;
    })
    .join("\n");
}
