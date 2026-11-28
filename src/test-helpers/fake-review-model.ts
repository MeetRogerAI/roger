import type { ModelProposal, ReviewInput, ReviewModel } from "@/lib/review/model";

/**
 * A review model for tests: answers with fixed proposals (or a function of
 * the input), or throws, and records every input it was given.
 */
export type FakeReviewModel = ReviewModel & { calls: ReviewInput[] };

export function fakeReviewModel(answer: ModelProposal[] | ((input: ReviewInput) => ModelProposal[] | Promise<ModelProposal[]>) | Error, name = "fake/review-model"): FakeReviewModel {
  const calls: ReviewInput[] = [];
  return {
    name,
    calls,
    async propose(input) {
      calls.push(input);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(input) : answer;
    },
  };
}
