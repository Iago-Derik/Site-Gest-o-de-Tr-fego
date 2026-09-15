const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

module.exports = async function handler(req, res) {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Não autorizado" });

  if (req.method === "GET") {
    const { videoId } = req.query;
    let query = supabase.from("notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (videoId) query = query.eq("video_id", videoId);
    
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    
    const formattedNotes = data.map(n => ({
      id: n.id,
      videoId: n.video_id,
      timestamp: n.timestamp,
      timestampFormatted: formatTime(n.timestamp),
      text: n.text,
      createdAt: n.created_at
    }));
    return res.status(200).json(formattedNotes);
  }

  if (req.method === "POST") {
    const { videoId, text, timestamp } = req.body;
    if (!videoId || !text) return res.status(400).json({ error: "Dados incompletos" });

    const { data, error } = await supabase.from("notes").insert({
      user_id: user.id,
      video_id: videoId,
      timestamp: parseFloat(timestamp) || 0,
      text: text.trim()
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
      id: data.id,
      videoId: data.video_id,
      timestamp: data.timestamp,
      timestampFormatted: formatTime(data.timestamp),
      text: data.text,
      createdAt: data.created_at
    });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID obrigatório" });
    const { error } = await supabase.from("notes").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};