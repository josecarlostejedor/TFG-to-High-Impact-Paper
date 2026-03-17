import express from "express";

const app = express();

app.get(["/api/health", "/health", "/api"], (req, res) => {
  res.json({ 
    status: "ok", 
    time: new Date().toISOString(), 
    environment: "vercel",
    endpoints: ["/api/parse-file", "/api/health"]
  });
});

export default app;
