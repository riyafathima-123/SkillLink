import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import routers
import usersRouter from "./routes/users.js";
import skillsRouter from "./routes/skills.js";
import connectionsRouter from "./routes/connections.js";
import creditsRouter from "./routes/credits.js";
import matchmakingRouter from "./routes/matchmaking.js";

// Import Supabase
import { supabase } from "./db/supabaseClient.js";

dotenv.config();

// ===== TEST SUPABASE CONNECTION =====
async function testSupabase() {
  try {
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error) {
      console.log("❌ SUPABASE ERROR:", error.message);
    } else {
      console.log("✅ SUPABASE CONNECTED - Tables exist!");
    }
  } catch (err) {
    console.log("❌ SUPABASE CONNECTION FAILED:", err.message);
  }
}

testSupabase();

// ===== REST OF YOUR SERVER CODE =====
const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// ===== ROUTES =====
app.use("/api/users", usersRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/matchmaking", matchmakingRouter);

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "SkillLink Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error", details: err.message });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✓ SkillLink Backend running on http://localhost:${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✓ CORS enabled for: ${process.env.CORS_ORIGIN || "all origins"}`);
});