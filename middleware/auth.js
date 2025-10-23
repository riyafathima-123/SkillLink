import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { supabase } from "../db/supabaseClient.js";

dotenv.config();

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * Middleware to verify JWT token and extract user information
 * Attaches user object to request: req.user = { id, email }
 */
export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;

    // Check if token exists
    if (!auth) {
      return res.status(401).json({ error: "Missing authentication token" });
    }

    // Extract token from "Bearer <token>"
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "Invalid authorization header format" });
    }

    const token = parts[1];

    // Verify JWT signature
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Extract user ID from JWT payload
    const userId = payload.sub;
    const email = payload.email;

    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Verify user exists in database
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(401).json({ error: "User verification failed" });
    }

    // Attach user to request object
    req.user = {
      id: userId,
      email: email,
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Authentication failed" });
  }
}