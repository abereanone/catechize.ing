import { buildQuestionArtifacts, writeQuestionArtifacts } from "./lib/questions-core.mjs";

const artifacts = await buildQuestionArtifacts();
await writeQuestionArtifacts(artifacts);

console.log(`Generated ${artifacts.questions.length} questions and ${artifacts.searchDocuments.length} search documents.`);

