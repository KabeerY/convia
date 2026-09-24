import { createServer } from "node:http";

const port = Number(process.env.CORE_JOBS_STATUS_PORT ?? 4001);
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "up", service: "core-jobs" }));
    return;
  }
  if (request.url === "/ready") {
    response.writeHead(503);
    response.end(
      JSON.stringify({ ready: false, missing: ["durable job runner (PR-06)"] }),
    );
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "0.0.0.0");
