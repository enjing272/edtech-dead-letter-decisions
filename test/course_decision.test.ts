import { test } from "node:test";
import { strict as assert } from "node:assert";
import { courseJob, decideDelivery } from "../src/course_jobs.ts";

test("a ready delivery completed after the learner deadline is reported late", () => {
  const job = courseJob.parse({ jobId: "delivery-42", courseId: "math-101", learnerId: "learner-7", deadline: "2026-09-20T12:00:00Z", completedAt: "2026-09-20T12:01:00Z", deliveryReady: true });
  assert.deepEqual(decideDelivery(job), { status: "delivered", report: "math-101: learner-7 completed after deadline" });
  assert.equal(decideDelivery({ ...job, deliveryReady: false }).status, "retry");
});
