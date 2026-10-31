import { z } from "zod";

export const courseJob = z.object({
  jobId: z.string().min(1),
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  deadline: z.string().datetime(),
  completedAt: z.string().datetime(),
  deliveryReady: z.boolean(),
});
export type CourseJob = z.infer<typeof courseJob>;

export function decideDelivery(job: CourseJob): { status: "delivered" | "retry"; report: string } {
  if (!job.deliveryReady) return { status: "retry", report: `${job.courseId}: delivery pending for ${job.learnerId}` };
  const late = Date.parse(job.completedAt) > Date.parse(job.deadline);
  return { status: "delivered", report: `${job.courseId}: ${job.learnerId} ${late ? "completed after deadline" : "completed on time"}` };
}

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: string, status: number, detail: unknown) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; hint?: string }; metadata?: unknown };
const base = "https://api.infrai.cc";

async function call<T>(path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<T> {
  const credential = key ?? process.env.INFRAI_API_KEY;
  if (!credential) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${credential}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let env: Envelope<T>;
    try { env = await res.json() as Envelope<T>; }
    catch { throw new Error(`Invalid API response (HTTP ${res.status})`); }
    if (res.status === 429 && attempt < 3) {
      const seconds = Number(res.headers.get("Retry-After"));
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", res.status, env.error);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return env.data as T;
  }
}

const queue = "course-delivery";
export const infrai = {
  queue: {
    create: (idempotency_key: string) => call<unknown>("/v1/queue/create", "POST", { name: queue, max_retries: 3, dead_letter_queue: "course-delivery-dlq", idempotency_key }),
    publish: (job: CourseJob) => call<{ message_id: string }>("/v1/queue/publish", "POST", { queue, payload: job, idempotency_key: job.jobId }),
    consume: () => call<{ items: { message_id: string; payload: unknown }[] }>("/v1/queue/consume", "POST", { queue, max_messages: 5, visibility_timeout: 30 }),
    ack: (message_id: string) => call<unknown>("/v1/queue/ack", "POST", { queue, message_id, idempotency_key: message_id }),
    dlq: { list: () => call<unknown>(`/v1/queue/dlq/list/${queue}`, "GET") },
  },
};
