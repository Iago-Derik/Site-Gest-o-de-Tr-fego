const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Não autorizado" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("favorites").select("video_id").eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data.map(f => f.video_id));
  }

  if (req.method === "POST") {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: "videoId obrigatório" });

    const { data: existing } = await supabase.from("favorites").select("id").eq("user_id", user.id).eq("video_id", videoId).single();

    let isFavorite = false;
    if (existing) {
      await supabase.from("favorites").delete().eq("id", existing.id);
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, video_id: videoId });
      isFavorite = true;
    }

    const { data: allFavs } = await supabase.from("favorites").select("video_id").eq("user_id", user.id);
    return res.status(200).json({ success: true, isFavorite, favorites: allFavs.map(f => f.video_id) });
  }

  return res.status(405).json({ error: "Method not allowed" });
};