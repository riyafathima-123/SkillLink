import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Middleware to require authentication via JWT token
 * Expects Authorization: Bearer <token> header
 */
export async function requireAuth(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required. Please provide a valid token." });
    }

    // Extract token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    // Verify and decode JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      full_name: decoded.full_name
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please login again." });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token. Please login again." });
    }
    return res.status(401).json({ error: "Authentication failed." });
  }
}