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
 * Get current user's credit balance
 */
router.get("/balance", async (req, res) => {
  try {
    // Get user ID from token or use default
    let userId = req.user?.id;
    
    // If no auth, return default balance for demo
    if (!userId) {
      return res.json({ balance: 100 });
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    // If wallet doesn't exist, create it
    if (error?.code === "PGRST116") {
      await supabase.from("wallets").insert({
        user_id: userId,
        balance: 100,
      });
      return res.json({ balance: 100 });
    }

    if (error) throw error;
    res.json({ balance: parseFloat(data.balance) || 100 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/credits/purchase
 * Purchase credits (called after payment gateway success)
 */
router.post("/purchase", requireAuth, async (req, res) => {
  const { error: vErr, value } = purchaseSchema.validate(req.body);
  if (vErr) return res.status(400).json({ error: vErr.message });

  try {
    const { amount, meta } = value;

    // Create or get wallet
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .upsert(
        { user_id: req.user.id, balance: 0 },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (wErr) throw wErr;

    // Increment balance
    const newBalance = parseFloat(w.balance || 0) + parseFloat(amount);
    await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    // Record transaction
    await supabase.from("credit_transactions").insert({
      user_id: req.user.id,
      type: "purchase",
      amount,
      meta,
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

    // Get current balance
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", req.user.id)
      .single();

    let balance = 0;
    if (wErr?.code !== "PGRST116" && wErr) throw wErr;
    if (!wErr) balance = parseFloat(w.balance || 0);

    // Check sufficient balance
    if (balance < amount) {
      return res.status(400).json({ error: "Insufficient credits" });
    }

    // Deduct credits
    const newBalance = balance - amount;
    await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    // Record transaction
    await supabase.from("credit_transactions").insert({
      user_id: req.user.id,
      type: "spend",
      amount,
      meta: { ...meta, reason },
    });

    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/credits/transactions
 * Get transaction history
 */
router.get("/transactions", async (req, res) => {
  try {
    // Get user ID from token or use default
    let userId = req.user?.id;
    
    if (!userId) {
      return res.json({ transactions: [] });
    }

    const limit = parseInt(req.query.limit || "50");

    const { data, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ transactions: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;