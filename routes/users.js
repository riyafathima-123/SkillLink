import express from "express";
import { supabase } from "../db/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import Joi from "joi";

const router = express.Router();

const updateUserSchema = Joi.object({
  full_name: Joi.string().max(100),
  bio: Joi.string().max(500),
  avatar_url: Joi.string().uri().allow(null),
});

/**
 * GET /api/users/me
 * Get current authenticated user's profile
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email, bio, avatar_url, created_at")
      .eq("id", req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users/:id
 * Get public user profile (no auth required)
 */
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, bio, avatar_url, created_at")
      .eq("id", req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/users/me
 * Update current user's profile
 */
router.put("/me", requireAuth, async (req, res) => {
  const { error: vErr, value } = updateUserSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { data, error } = await supabase
      .from("users")
      .update(value)
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/users/me
 * Delete current user account
 */
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from("users").delete().eq("id", req.user.id);

    if (error) throw error;
    res.json({ ok: true, message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
