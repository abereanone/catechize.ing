// Settings for the question tooling that differ from site to site.
//
// This file belongs to this site alone. The shared tooling (see
// scripts/shared-tooling.mjs) reads it and never overwrites it.
export default {
  // Does this site show a long answer under the short one (the part of a
  // question file after the <!-- LONG_ANSWER --> line)? When false, a question
  // file that has that line fails the check, because its long part would be
  // left off the page without a word.
  longAnswers: true,
};
