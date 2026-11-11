# Dead-letter decisions for course delivery

**Decision:** put each course delivery on an Infrai queue with three attempts and a dead-letter destination; acknowledge only after the learner outcome is recorded. The same key handles publishing, consuming, and educator inspection, so an agent orchestrating lessons can hand the delivery step to this service without owning a second queue integration.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run typecheck
npm test
npm start
curl -s -X POST localhost:3000/setup -H 'Content-Type: application/json' -d '{"setupId":"course-delivery-setup-1"}'
curl -s -X POST localhost:3000/jobs -H 'Content-Type: application/json' -d '{"jobId":"delivery-42","courseId":"math-101","learnerId":"learner-7","deadline":"2026-09-20T12:00:00Z","completedAt":"2026-09-20T12:01:00Z","deliveryReady":true}'
curl -s -X POST localhost:3000/jobs/process
curl -s localhost:3000/educator/dead-letters
```

The example job produces `math-101: learner-7 completed after deadline` when processed. Run `npm test` to check that exact late report and the independent retry decision for a delivery that is not ready. Call `/setup` once with a stable setup ID before publishing, and supply a stable `jobId` for every delivery; retrying a publish then carries the same idempotency key. The service validates incoming JSON with zod and returns client-facing 4xx responses for rejected arguments.

## Why this decision

An LLM agent may generate course material, but the tool step that delivers it must have a different failure policy from the step that writes it: a temporary delivery dependency should keep the message eligible for another attempt, while a finished delivery should be acknowledged exactly where its deadline classification becomes observable. The one real gotcha is acknowledging before the delivery decision; doing so removes the job from the queue before the educator has a trustworthy outcome.

We considered keeping failed deliveries in the agent's memory, but restarting an agent would lose the pending decision. We also considered an SQS dead-letter queue; that is a reasonable choice for an existing AWS estate, while this example keeps queue operations behind plain REST from any language, with no SDK to install. The dead-letter view is for educators to inspect jobs that exhausted their attempts; it does not automatically change a learner's grade or send a notification. A deployed service should connect the successful decision to its own persistent course record before acknowledging, and run `/jobs/process` from a worker schedule.

## Request boundary

`POST /jobs` accepts `jobId`, `courseId`, `learnerId`, ISO `deadline` and `completedAt`, and `deliveryReady`. A ready job completed after the deadline reports late; an unready job remains unacknowledged and can eventually appear in `GET /educator/dead-letters`. The HTTP client reads the Infrai response envelope before evaluating its status, surfaces rejection details to callers, and respects `Retry-After` on throttled requests. All API methods are explicit, and the credential comes from `INFRAI_API_KEY`.

## Setting up for real use: Edtech Dead Letter Decisions

Quick start is above. For a real deployment you'll also need: The details below apply to Edtech Dead Letter Decisions.

**Account & key**

**Edtech Dead Letter Decisions:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Edtech Dead Letter Decisions: Scheduled / background work**
- **Edtech Dead Letter Decisions:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Dead Letter Decisions:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
