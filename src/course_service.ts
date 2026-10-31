import { createServer } from "node:http";
import { z, ZodError } from "zod";
import { courseJob, decideDelivery, infrai, InfraiError } from "./course_jobs.ts";

const server = createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.method === "POST" && req.url === "/setup") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const { setupId } = z.object({ setupId: z.string().min(1) }).parse(JSON.parse(Buffer.concat(chunks).toString()));
      await infrai.queue.create(setupId);
      return send(200, { queue: "course-delivery", status: "ready" });
    }
    if (req.method === "POST" && req.url === "/jobs") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const job = courseJob.parse(JSON.parse(Buffer.concat(chunks).toString()));
      const published = await infrai.queue.publish(job);
      return send(202, { jobId: job.jobId, messageId: published.message_id });
    }
    if (req.method === "POST" && req.url === "/jobs/process") {
      const decisions: string[] = [];
      for (const message of (await infrai.queue.consume()).items) {
        const job = courseJob.parse(message.payload);
        const result = decideDelivery(job);
        if (result.status === "delivered") await infrai.queue.ack(message.message_id);
        decisions.push(result.report);
      }
      return send(200, { decisions });
    }
    if (req.method === "GET" && req.url === "/educator/dead-letters") {
      return send(200, { deadLetters: await infrai.queue.dlq.list() });
    }
    return send(404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return send(400, { error: "Invalid request body" });
    if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, detail: error.detail });
    console.error(error);
    return send(502, { error: "Processing failed" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log("Course service listening"));
