import express from "express";
import { supabase } from "../db/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import Joi from "joi";

const router = express.Router();

const connectionSchema = Joi.object({
  skill_id: Joi.string().required(),
  message: Joi.string().allow("").max(1000),
});

const updateConnectionSchema = Joi.object({
  status: Joi.string().valid("pending", "accepted", "rejected", "completed"),
});

/**
 * POST /api/connections
 * Create a connection request to learn a skill
 */
router.post("/", requireAuth, async (req, res) => {
  const { error: vErr, value } = connectionSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { data: skill, error: sErr } = await supabase
      .from("skills")
      .select("owner_id, price")
      .eq("id", value.skill_id)
      .single();

    if (sErr) {
      return res.status(404).json({ error: "Skill not found" });
    }

    if (skill.owner_id === req.user.id) {
      return res.status(400).json({ error: "Cannot connect to your own skill" });
    }

    const connection = {
      skill_id: value.skill_id,
      learner_id: req.user.id,
      teacher_id: skill.owner_id,
      price: skill.price,
      status: "pending",
      message: value.message || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("connections")
      .insert(connection)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/connections
 * Get all connections for current user
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .or(`learner_id.eq.${req.user.id},teacher_id.eq.${req.user.id}`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/connections/:id
 * Get a specific connection
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (data.learner_id !== req.user.id && data.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to view this connection" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/connections/:id
 * Update connection status (teacher can accept/reject/complete)
 */
router.put("/:id", requireAuth, async (req, res) => {
  const { error: vErr, value } = updateConnectionSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { data: connection, error: cErr } = await supabase
      .from("connections")
      .select("teacher_id, learner_id, price")
      .eq("id", req.params.id)
      .single();

    if (cErr) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (connection.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "Only teacher can update connection status" });
    }

    const { data, error } = await supabase
      .from("connections")
      .update({ status: value.status })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (value.status === "accepted") {
      try {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", connection.learner_id)
          .single();

        if (wallet) {
          const newBalance = parseFloat(wallet.balance) - parseFloat(connection.price);
          await supabase
            .from("wallets")
            .update({ balance: newBalance })
            .eq("user_id", connection.learner_id);

          await supabase.from("credit_transactions").insert({
            user_id: connection.learner_id,
            type: "spend",
            amount: connection.price,
            meta: { reason: "Learning session payment" },
          });
        }
      } catch (err) {
        console.error("Error deducting credits:", err);
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/connections/:id
 * Cancel a connection request (learner only)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { data: connection, error: cErr } = await supabase
      .from("connections")
      .select("learner_id")
      .eq("id", req.params.id)
      .single();

    if (cErr) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (connection.learner_id !== req.user.id) {
      return res.status(403).json({ error: "Only learner can cancel connection" });
    }

    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: "Connection cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
