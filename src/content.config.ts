import { defineCollection } from "astro:content";
import { questionFrontmatterSchema } from "@/lib/question-schema.js";

const questions = defineCollection({
  type: "content",
  schema: questionFrontmatterSchema,
});

export const collections = {
  questions,
};
