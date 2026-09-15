const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function cleanTitle(rawName) {
  if (!rawName) return "";
  let name = rawName.replace(/\.[a-zA-Z0-9]+$/, "");
  return name.replace(/^(?:(?:m[oó]dulo|aula|li[cç][aã]o|ep(?:is[oó]dio)?|cap(?:[ií]tulo)?|m)?\s*\d+(?:[\.\-_]\d+)*\s*[-–—:]*\s*)+/i, "").trim() || name;
}

function getSortKey(str) {
  return str.replace(/(\d+)/g, (n) => n.padStart(6, "0")).toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. Busca os vídeos no R2
    const command = new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME });
    const s3Response = await s3.send(command);
    const files = s3Response.Contents || [];

    // 2. Busca os dados do usuário autenticado no Supabase
    // (Em produção, você pegará o token JWT do header. Por ora, vamos assumir que o usuário tá logado no client)
    const token = req.headers.authorization?.split(" ")[1] || "";
    const { data: { user } } = await supabase.auth.getUser(token);
    
    let progressData = {};
    let favoritesData = [];
    let notesData = [];

    if (user) {
      const [prog, favs, notes] = await Promise.all([
        supabase.from("progress").select("*").eq("user_id", user.id),
        supabase.from("favorites").select("video_id").eq("user_id", user.id),
        supabase.from("notes").select("*").eq("user_id", user.id)
      ]);
      prog.data?.forEach(p => { progressData[p.video_id] = p; });
      favoritesData = favs.data?.map(f => f.video_id) || [];
      notesData = notes.data || [];
    }

    const coursesMap = new Map();
    const allowedExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v"];

    const allVideos = files
      .filter(f => allowedExts.some(ext => f.Key.toLowerCase().endsWith(ext)))
      .map(f => {
        const parts = f.Key.split("/");
        let courseName = "Curso Principal", moduleName = "Módulo 1", lessonFileName = f.Key;
        
        if (parts.length >= 3) {
          courseName = parts[0]; moduleName = parts[1]; lessonFileName = parts.slice(2).join(" - ");
        } else if (parts.length === 2) {
          moduleName = parts[0]; lessonFileName = parts[1];
        }

        return {
          id: f.Key,
          fileName: parts[parts.length - 1],
          rawTitle: lessonFileName.replace(/\.[a-zA-Z0-9]+$/, ""),
          cleanTitle: cleanTitle(lessonFileName),
          course: courseName,
          cleanCourse: cleanTitle(courseName),
          module: moduleName,
          cleanModule: cleanTitle(moduleName),
          ext: f.Key.slice(f.Key.lastIndexOf(".")),
          sortKey: getSortKey(f.Key),
          videoUrl: `${process.env.R2_PUBLIC_URL}/${encodeURI(f.Key)}`,
          thumbUrl: `${process.env.R2_PUBLIC_URL}/${encodeURI(f.Key)}` // O R2 não gera thumb automático. Precisaremos adaptar isso no frontend.
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    for (const video of allVideos) {
      if (!coursesMap.has(video.course)) {
        coursesMap.set(video.course, { id: video.course, title: video.course, cleanTitle: video.cleanCourse, modulesMap: new Map(), totalVideos: 0, completedVideos: 0 });
      }
      const cData = coursesMap.get(video.course);
      cData.totalVideos++;

      if (!cData.modulesMap.has(video.module)) {
        cData.modulesMap.set(video.module, { id: `${video.course}/${video.module}`, title: video.module, cleanTitle: video.cleanModule, courseId: video.course, videos: [], totalVideos: 0, completedVideos: 0 });
      }
      const mData = cData.modulesMap.get(video.module);
      mData.totalVideos++;

      const p = progressData[video.id];
      const isCompleted = !!p?.completed;
      if (isCompleted) { cData.completedVideos++; mData.completedVideos++; }

      video.progress = p || { currentTime: 0, duration: 0, percentage: 0, completed: false };
      video.isCompleted = isCompleted;
      video.isFavorite = favoritesData.includes(video.id);
      video.notesCount = notesData.filter(n => n.video_id === video.id).length;

      mData.videos.push(video);
    }

    const courses = Array.from(coursesMap.values()).map(c => ({
      ...c,
      percentage: c.totalVideos > 0 ? Math.round((c.completedVideos / c.totalVideos) * 100) : 0,
      modules: Array.from(c.modulesMap.values()).map(m => ({
        ...m,
        percentage: m.totalVideos > 0 ? Math.round((m.completedVideos / m.totalVideos) * 100) : 0
      }))
    }));

    // Remove maps before sending
    courses.forEach(c => delete c.modulesMap);

    res.status(200).json({ courses, totalCourses: courses.length, totalVideos: allVideos.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}