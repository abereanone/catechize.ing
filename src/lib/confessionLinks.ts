// Where each question is answered in the confessions.
//
// The mapping is owned and published by confess.catechize.ing and pulled in by
// scripts/sync-confession-links.mjs. This module only indexes it by question
// slug so a question page can ask one question and get an ordered answer.

import data from "../data/confession-links.json";

export type Confidence = "high" | "medium" | "low" | "none";

type Feed = {
  generatedAt: string;
  source: string;
  mappings: {
    id: string;
    catechism: { prefix: string; label: string; short: string };
    confession: { slug: string; title: string; unitLabel: string; url: string };
    questions: {
      question: string;
      n: number;
      confidence: Confidence;
      decision: string;
      links: {
        ref: string;
        citation: string;
        title: string;
        coverage: number | null;
        url: string;
      }[];
    }[];
    elsewhere: {
      question: string;
      n: number;
      doc: string;
      refs: string[];
      note: string;
    }[];
  }[];
};

export type ConfessionLink = {
  /** "Chapter 11, Paragraph 1" */
  citation: string;
  /** Chapter title, "Of Justification". */
  title: string;
  url: string;
  coverage: number | null;
};

export type ConfessionEntry = {
  confession: string;
  confessionUrl: string;
  confidence: Confidence;
  links: ConfessionLink[];
  /** Set where this confession has no paragraph but another one does. */
  elsewhere?: { doc: string; refs: string[] };
};

const feed = data as Feed;

const byQuestion = new Map<string, ConfessionEntry[]>();

for (const mapping of feed.mappings) {
  for (const row of mapping.questions) {
    const list = byQuestion.get(row.question) ?? [];
    list.push({
      confession: mapping.confession.title,
      confessionUrl: mapping.confession.url,
      confidence: row.confidence,
      links: row.links,
    });
    byQuestion.set(row.question, list);
  }

  // A question with no paragraph in its own confession, where another confession
  // carries it, is worth showing — it is the point where the traditions parted.
  for (const row of mapping.elsewhere) {
    const list = byQuestion.get(row.question) ?? [];
    list.push({
      confession: mapping.confession.title,
      confessionUrl: mapping.confession.url,
      confidence: "none",
      links: [],
      elsewhere: { doc: row.doc, refs: row.refs },
    });
    byQuestion.set(row.question, list);
  }
}

const ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2, none: 3 };

for (const list of byQuestion.values()) {
  list.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence]);
}

/** Confessions answering this question, most confident first. */
export function getConfessionLinks(slug: string): ConfessionEntry[] {
  return byQuestion.get(slug) ?? [];
}

export const confessionLinksGeneratedAt = feed.generatedAt;
