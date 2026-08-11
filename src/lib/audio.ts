import audioManifest from "@/generated/audio.json";
import { siteSettings } from "@/config/siteSettings";
import type { Question } from "@/lib/questions";

export interface AudioTrack {
  slug: string;
  /** Seconds, from ffprobe. */
  duration: number;
  bytes: number;
  /** Same-origin so the anchor `download` attribute is honoured. */
  src: string;
  downloadHref: string;
  downloadFilename: string;
}

type ManifestEntry = { duration: number; bytes: number };

const manifest = audioManifest as Record<string, ManifestEntry>;

/** Windows and most download UIs choke on these; the rest of a title is fine. */
function toDownloadFilename(question: Pick<Question, "id" | "title">): string {
  const title = question.title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  const prefix = typeof question.id === "number" ? `Q${question.id} - ` : "";

  return `${prefix}${title}.mp3`;
}

export function isAudioEnabled(): boolean {
  return siteSettings.enableAudio === true;
}

/**
 * Returns null when the feature is off, or when a question simply has no
 * recording -- bc-115..118 postdate the album, and no other catechism has one.
 */
export function getAudioTrack(question: Pick<Question, "id" | "slug" | "title">): AudioTrack | null {
  if (!isAudioEnabled()) {
    return null;
  }

  const entry = manifest[question.slug];

  if (!entry) {
    return null;
  }

  const src = `/audio/${question.slug}.mp3`;
  const downloadFilename = toDownloadFilename(question);

  return {
    slug: question.slug,
    duration: entry.duration,
    bytes: entry.bytes,
    src,
    downloadHref: `${src}?download=${encodeURIComponent(downloadFilename)}`,
    downloadFilename,
  };
}

export function hasAudio(slug: string): boolean {
  return isAudioEnabled() && Boolean(manifest[slug]);
}

export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatTotalDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.round((whole % 3600) / 60);

  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

/** Every question that has a recording, in catechism order. */
export function listAudioQuestions(questions: Question[]): Array<{ question: Question; track: AudioTrack }> {
  if (!isAudioEnabled()) {
    return [];
  }

  return questions
    .filter((question) => Boolean(manifest[question.slug]))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((question) => ({ question, track: getAudioTrack(question)! }));
}
