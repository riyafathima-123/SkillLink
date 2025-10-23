import express from "express";
import { supabase } from "../db/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import Joi from "joi";

const router = express.Router();

// Validation schemas
const purchaseSchema = Joi.object({
  amount: Joi.number().positive().required(),
  meta: Joi.object().optional(),
});

const spendSchema = Joi.object({
  amount: Joi.number().positive().required(),
  reason: Joi.string().optional(),
  meta: Joi.object().optional(),
});

/**
 * GET /api/credits/balance
 * Get current user's credit balance from users table
 */
router.get("/balance", requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("credits")
      .eq("id", req.user.id)
      .single();

    if (error) {
      return res.status(500).json({ error: "Failed to fetch balance" });
    }

    res.json({ balance: user.credits || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/credits/purchase
 * Purchase credits (called after payment gateway success)
 * Adds credits to user account
 */
router.post("/purchase", requireAuth, async (req, res) => {
  const { error: vErr, value } = purchaseSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { amount, meta } = value;

    // Get current credits
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("credits")
      .eq("id", req.user.id)
      .single();

    if (userErr) {
      return res.status(500).json({ error: "Failed to fetch user credits" });
    }

    const currentCredits = user.credits || 0;
    const newBalance = currentCredits + parseFloat(amount);

    // Update user credits
    const { error: updateErr } = await supabase
      .from("users")
      .update({ 
        credits: newBalance,
        updated_at: new Date().toISOString() 
      })
      .eq("id", req.user.id);

    if (updateErr) throw updateErr;

    // Record transaction
    await supabase.from("credit_transactions").insert({
      user_id: req.user.id,
      type: "purchase",
      amount: parseFloat(amount),
      meta: meta || {},
      created_at: new Date().toISOString()
    });

    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/credits/spend
 * Spend credits (manual deduction)
 */
router.post("/spend", requireAuth, async (req, res) => {
  const { error: vErr, value } = spendSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { amount, reason, meta } = value;

    // Get current credits
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("credits")
      .eq("id", req.user.id)
      .single();

    if (userErr) {
      return res.status(500).json({ error: "Failed to fetch user credits" });
    }

    const currentCredits = user.credits || 0;

    // Check sufficient balance
    if (currentCredits < amount) {
      return res.status(400).json({ 
        error: "Insufficient credits",
        balance: currentCredits,
        required: amount
      });
    }

    // Deduct credits
    const newBalance = currentCredits - parseFloat(amount);
    const { error: updateErr } = await supabase
      .from("users")
      .update({ 
        credits: newBalance,
        updated_at: new Date().toISOString() 
      })
      .eq("id", req.user.id);

    if (updateErr) throw updateErr;

    // Record transaction
    await supabase.from("credit_transactions").insert({
      user_id: req.user.id,
      type: "spend",
      amount: parseFloat(amount),
      meta: { ...meta, reason },
      created_at: new Date().toISOString()
    });

    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/credits/transactions
 * Get transaction history for current user
 */
router.get("/transactions", requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50");

    const { data, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ transactions: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;