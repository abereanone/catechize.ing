import { buildQuestionArtifacts } from "./lib/questions-core.mjs";

const artifacts = await buildQuestionArtifacts();

console.log(`Validated ${artifacts.questions.length} question files successfully.`);

