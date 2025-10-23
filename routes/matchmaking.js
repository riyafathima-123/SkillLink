import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  findComplementarySkills,
  searchSkillsByQuery,
} from "../services/matchmaking.js";

const router = express.Router();

/**
 * GET /api/matchmaking/for-skill/:skillId
 * Find complementary skills based on a skill you teach
 */
router.get("/for-skill/:skillId", requireAuth, async (req, res) => {
  const skillId = req.params.skillId;
  const limit = parseInt(req.query.limit || "10");

  try {
    const matches = await findComplementarySkills(skillId, { limit });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/matchmaking/search
 * Custom search for skills with filtering
 */
router.post("/search", requireAuth, async (req, res) => {
  const { query = "", candidatesLimit = 30 } = req.body || {};

  try {
    const results = await searchSkillsByQuery(query, candidatesLimit);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
