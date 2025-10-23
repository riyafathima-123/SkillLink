import { supabase } from "../db/supabaseClient.js";

/**
 * Calculate tag overlap score between two skill tag arrays
 * Formula: common_tags / sqrt(len(A) * len(B))
 * Measures similarity between skill tags (0-1 scale)
 */
function calculateTagOverlapScore(skillTagsA = [], skillTagsB = []) {
  const setA = new Set((skillTagsA || []).map((t) => t.toLowerCase()));
  const setB = new Set((skillTagsB || []).map((t) => t.toLowerCase()));

  if (setA.size === 0 || setB.size === 0) return 0;

  let commonCount = 0;
  for (const tag of setA) {
    if (setB.has(tag)) commonCount++;
  }

  return commonCount / Math.sqrt(setA.size * setB.size);
}

/**
 * Find complementary skills based on tag overlap
 * If user teaches "Web Development", this finds skills to learn
 * that have similar tags
 */
export async function findComplementarySkills(
  skillId,
  { limit = 20, minScore = 0 } = {}
) {
  try {
    // Fetch the reference skill
    const { data: referenceSkill, error: sErr } = await supabase
      .from("skills")
      .select("*")
      .eq("id", skillId)
      .single();

    if (sErr || !referenceSkill) {
      throw new Error("Skill not found");
    }

    // Fetch all other skills (excluding the skill owner)
    const { data: candidates, error } = await supabase
      .from("skills")
      .select("id, title, description, owner_id, price, tags, created_at")
      .neq("owner_id", referenceSkill.owner_id)
      .limit(500);

    if (error) throw error;

    // Score each candidate and sort
    const scored = (candidates || [])
      .map((candidate) => ({
        ...candidate,
        score: calculateTagOverlapScore(
          referenceSkill.tags || [],
          candidate.tags || []
        ),
      }))
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  } catch (err) {
    throw err;
  }
}

/**
 * Search for skills by query string
 * Returns skills matching the search query, ranked by relevance
 */
export async function searchSkillsByQuery(query, limit = 30) {
  try {
    const { data: candidates, error } = await supabase
      .from("skills")
      .select("id, title, description, owner_id, price, tags, created_at")
      .ilike("title", `%${query}%`)
      .limit(limit);

    if (error) throw error;

    // Score by tag count and description relevance
    const scored = (candidates || []).map((candidate) => ({
      ...candidate,
      score:
        (candidate.tags ? candidate.tags.length : 0) +
        (candidate.description?.toLowerCase().includes(query.toLowerCase())
          ? 2
          : 0),
    }));

    return scored.sort((a, b) => b.score - a.score);
  } catch (err) {
    throw err;
  }
}
