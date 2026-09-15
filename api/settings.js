const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Não autorizado" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("settings").select("*").eq("user_id", user.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    
    const settings = data || { theme: "dark", accentColor: "indigo", autoPlayNext: true, playbackSpeed: 1, volume: 1 };
    return res.status(200).json({
      theme: settings.theme || settings.theme,
      accentColor: settings.accent_color || settings.accentColor,
      autoPlayNext: settings.auto_play_next !== false,
      playbackSpeed: settings.playback_speed || 1,
      volume: settings.volume ?? 1
    });
  }

  if (req.method === "POST") {
    const { theme, accentColor, autoPlayNext, playbackSpeed, volume } = req.body;
    
    const payload = { user_id: user.id, updated_at: new Date().toISOString() };
    if (theme !== undefined) payload.theme = theme;
    if (accentColor !== undefined) payload.accent_color = accentColor;
    if (autoPlayNext !== undefined) payload.auto_play_next = autoPlayNext;
    if (playbackSpeed !== undefined) payload.playback_speed = playbackSpeed;
    if (volume !== undefined) payload.volume = volume;

    const { data, error } = await supabase.from("settings").upsert(payload, { onConflict: 'user_id' }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      success: true,
      settings: {
        theme: data.theme,
        accentColor: data.accent_color,
        autoPlayNext: data.auto_play_next,
        playbackSpeed: data.playback_speed,
        volume: data.volume
      }
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};