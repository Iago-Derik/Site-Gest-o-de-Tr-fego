const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function createWorkspaceId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

module.exports = async function handler(req, res) {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Não autorizado" });

  // Busca o workspace atual
  let { data: workspace } = await supabase.from("workspace").select("*").eq("user_id", user.id).single();
  if (!workspace) {
    workspace = { clients: [], campaigns: [], documents: [], reports: [] };
  }

  if (req.method === "GET") {
    return res.status(200).json(workspace);
  }

  if (req.method === "POST") {
    const { type, payload } = req.body;
    const collectionMap = { client: "clients", campaign: "campaigns", document: "documents", report: "reports" };
    const collection = collectionMap[type];
    
    if (!collection) return res.status(400).json({ error: "Tipo inválido" });

    const id = payload.id || createWorkspaceId(type);
    const index = workspace[collection].findIndex(item => item.id === id);
    const record = {
      ...payload,
      id,
      updatedAt: new Date().toISOString(),
      createdAt: index >= 0 ? workspace[collection][index].createdAt : new Date().toISOString()
    };

    if (index >= 0) workspace[collection][index] = record;
    else workspace[collection].push(record);

    const { error } = await supabase.from("workspace").upsert({
      user_id: user.id,
      [collection]: workspace[collection],
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, record, workspace });
  }

  if (req.method === "DELETE") {
    const { type, id } = req.query; // Precisaremos ajustar o frontend para enviar via query
    const collectionMap = { client: "clients", campaign: "campaigns", document: "documents", report: "reports" };
    const collection = collectionMap[type];
    
    if (!collection) return res.status(400).json({ error: "Tipo inválido" });

    workspace[collection] = workspace[collection].filter(item => item.id !== id);
    
    if (type === "client") {
      workspace.campaigns = workspace.campaigns.filter(item => item.clientId !== id);
      workspace.documents = workspace.documents.filter(item => item.clientId !== id);
    }

    const { error } = await supabase.from("workspace").upsert({
      user_id: user.id,
      clients: workspace.clients,
      campaigns: workspace.campaigns,
      documents: workspace.documents,
      reports: workspace.reports,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, workspace });
  }

  return res.status(405).json({ error: "Method not allowed" });
};