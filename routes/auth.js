import express from "express";
import Joi from "joi";
import jwt from "jsonwebtoken";
import { supabase } from "../db/supabaseClient.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const loginSchema = Joi.object({ 
  email: Joi.string().email().required(),
  password: Joi.string().optional() // For future password auth
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(100).required(),
  password: Joi.string().min(6).optional()
});

/**
 * POST /api/auth/login
 * Login with email (and optional password in the future)
 * Returns JWT token and user data
 */
router.post("/login", async (req, res) => {
  try {
    const { error: vErr, value } = loginSchema.validate(req.body || {});
    if (vErr) return res.status(400).json({ error: vErr.message });

    const { email } = value;

    // Check if user exists in database
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, full_name, bio, avatar_url, created_at")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials or user not found" });
    }

    // Generate JWT token with user payload
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        full_name: user.full_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ 
      token, 
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        bio: user.bio,
        avatar_url: user.avatar_url
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/register
 * Register a new user
 * Returns JWT token and user data
 */
router.post("/register", async (req, res) => {
  try {
    const { error: vErr, value } = registerSchema.validate(req.body || {});
    if (vErr) return res.status(400).json({ error: vErr.message });

    const { email, full_name } = value;

    // Check if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create new user
    const { data: user, error } = await supabase
      .from("users")
      .insert({ 
        email, 
        full_name,
        created_at: new Date().toISOString()
      })
      .select("id, email, full_name, bio, avatar_url, created_at")
      .single();

    if (error) throw error;

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        full_name: user.full_name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({ 
      token, 
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        bio: user.bio,
        avatar_url: user.avatar_url
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/verify
 * Verify a JWT token and return user data
 */
router.post("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    res.json({ 
      valid: true, 
      user: {
        id: decoded.id,
        email: decoded.email,
        full_name: decoded.full_name
      }
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
