const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) return res.status(401).json({ error: "Não autorizado" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("progress").select("*").eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    
    const progressData = { lastVideoId: null, videos: {} };
    let lastWatched = null;
    
    data.forEach(p => {
      progressData.videos[p.video_id] = {
        currentTime: p.current_time,
        duration: p.duration,
        percentage: p.percentage,
        completed: p.completed,
        lastWatchedAt: p.last_watched_at
      };
      if (!lastWatched || new Date(p.last_watched_at) > new Date(lastWatched.last_watched_at)) {
        lastWatched = p;
      }
    });
    
    if (lastWatched) progressData.lastVideoId = lastWatched.video_id;
    return res.status(200).json(progressData);
  }

  if (req.method === "POST") {
    const { videoId, currentTime, duration, completed } = req.body;
    if (!videoId) return res.status(400).json({ error: "videoId obrigatório" });

    const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    const { data: prev } = await supabase.from("progress").select("completed").eq("user_id", user.id).eq("video_id", videoId).single();
    
    let isCompleted = typeof completed === "boolean" ? completed : !!prev?.completed;
    if (percentage >= 90) isCompleted = true;

    const payload = {
      user_id: user.id,
      video_id: videoId,
      current_time: currentTime || 0,
      duration: duration || 0,
      percentage: percentage > 100 ? 100 : percentage,
      completed: isCompleted,
      last_watched_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from("progress").upsert(payload, { onConflict: 'user_id, video_id' }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      success: true,
      progress: {
        currentTime: data.current_time,
        duration: data.duration,
        percentage: data.percentage,
        completed: data.completed,
        lastWatchedAt: data.last_watched_at
      }
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};