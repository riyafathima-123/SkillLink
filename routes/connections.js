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
 * When accepted: deduct credits from learner, add to teacher, record transactions
 */
router.put("/:id", requireAuth, async (req, res) => {
  const { error: vErr, value } = updateConnectionSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    // Get connection details
    const { data: connection, error: cErr } = await supabase
      .from("connections")
      .select("teacher_id, learner_id, price, status, skill_id")
      .eq("id", req.params.id)
      .single();

    if (cErr) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (connection.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "Only teacher can update connection status" });
    }

    // If accepting the connection, handle credit transfer
    if (value.status === "accepted" && connection.status !== "accepted") {
      // Get learner's current credits
      const { data: learner, error: learnerErr } = await supabase
        .from("users")
        .select("credits, email, full_name")
        .eq("id", connection.learner_id)
        .single();

      if (learnerErr) {
        return res.status(500).json({ error: "Failed to fetch learner details" });
      }

      const learnerCredits = learner.credits || 0;
      const price = parseFloat(connection.price);

      // Check if learner has sufficient credits
      if (learnerCredits < price) {
        return res.status(400).json({ 
          error: "Insufficient credits",
          details: `Learner has ${learnerCredits} credits but needs ${price} credits`
        });
      }

      // Get teacher's current credits
      const { data: teacher, error: teacherErr } = await supabase
        .from("users")
        .select("credits, email, full_name")
        .eq("id", connection.teacher_id)
        .single();

      if (teacherErr) {
        return res.status(500).json({ error: "Failed to fetch teacher details" });
      }

      const teacherCredits = teacher.credits || 0;

      // Deduct credits from learner
      const { error: deductErr } = await supabase
        .from("users")
        .update({ 
          credits: learnerCredits - price,
          updated_at: new Date().toISOString()
        })
        .eq("id", connection.learner_id);

      if (deductErr) {
        return res.status(500).json({ error: "Failed to deduct credits from learner" });
      }

      // Add credits to teacher
      const { error: addErr } = await supabase
        .from("users")
        .update({ 
          credits: teacherCredits + price,
          updated_at: new Date().toISOString()
        })
        .eq("id", connection.teacher_id);

      if (addErr) {
        // Rollback learner credit deduction
        await supabase
          .from("users")
          .update({ credits: learnerCredits })
          .eq("id", connection.learner_id);
        
        return res.status(500).json({ error: "Failed to add credits to teacher" });
      }

      // Record learner transaction (spend)
      await supabase.from("credit_transactions").insert({
        user_id: connection.learner_id,
        type: "spend",
        amount: price,
        meta: {
          connection_id: req.params.id,
          skill_id: connection.skill_id,
          teacher_id: connection.teacher_id,
          teacher_name: teacher.full_name,
          reason: "Payment for learning session"
        },
        created_at: new Date().toISOString()
      });

      // Record teacher transaction (earning - using 'purchase' as earning type or add 'earn' to check constraint)
      await supabase.from("credit_transactions").insert({
        user_id: connection.teacher_id,
        type: "refund", // Using 'refund' as a workaround for earning since 'earn' is not in the constraint
        amount: price,
        meta: {
          connection_id: req.params.id,
          skill_id: connection.skill_id,
          learner_id: connection.learner_id,
          learner_name: learner.full_name,
          reason: "Earnings from teaching session"
        },
        created_at: new Date().toISOString()
      });
    }

    // Update connection status
    const { data, error } = await supabase
      .from("connections")
      .update({ 
        status: value.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      ...data, 
      message: value.status === "accepted" ? "Connection accepted and credits transferred" : "Connection updated"
    });
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
