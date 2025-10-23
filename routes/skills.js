import express from "express";
import { supabase } from "../db/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import Joi from "joi";

const router = express.Router();

const skillSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().allow("").max(2000),
  price: Joi.number().min(0).required(),
  tags: Joi.array().items(Joi.string()).optional(),
});

/**
 * GET /api/skills
 * List all skills with optional search query
 */
router.get("/", async (req, res) => {
  const q = req.query.q ?? "";
  const limit = parseInt(req.query.limit || "50");

  try {
    let query = supabase
      .from("skills")
      .select("id, title, description, price, tags, owner_id, created_at");

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/skills
 * Create a new skill (requires authentication)
 */
router.post("/",  async (req, res) => {
  const { error: vErr, value } = skillSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const newSkill = {
      title: value.title,
      description: value.description,
      price: value.price,
      tags: value.tags || [],
      owner_id: req.user.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("skills")
      .insert(newSkill)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/skills/:id
 * Get a specific skill by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ error: "Skill not found" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/skills/:id
 * Update a skill (owner only)
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { data: skill, error: sErr } = await supabase
      .from("skills")
      .select("owner_id")
      .eq("id", req.params.id)
      .single();

    if (sErr || !skill || skill.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to update this skill" });
    }

    const { error: vErr } = skillSchema.validate(req.body);
    if (vErr) return res.status(400).json({ error: vErr.message });

    const { data, error } = await supabase
      .from("skills")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/skills/:id
 * Delete a skill (owner only)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { data: skill, error: sErr } = await supabase
      .from("skills")
      .select("owner_id")
      .eq("id", req.params.id)
      .single();

    if (sErr || !skill || skill.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to delete this skill" });
    }

    const { error } = await supabase.from("skills").delete().eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: "Skill deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
