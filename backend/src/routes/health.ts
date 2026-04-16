import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "eia-backend",
    timestamp: new Date().toISOString(),
  });
});

export default health;
