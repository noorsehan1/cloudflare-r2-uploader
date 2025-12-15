export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleCors(env);

    if (url.pathname === "/upload" && request.method === "POST") return handleUpload(request, env);

    if (url.pathname === "/delete" && request.method === "POST") return handleDelete(request, env);

    return new Response("Not Found. Gunakan POST /upload atau /delete", { status: 404 });
  }
};

function handleCors(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400",
    }
  });
}

// ===================== UPLOAD FILE =====================
async function handleUpload(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const formData = await request.formData();
    const bucketName = formData.get("bucketName");
    const file = formData.get("file");
    let fileName = formData.get("fileName");

    if (!bucketName) {
      return new Response(JSON.stringify({ success: false, error: "Bucket tidak boleh kosong" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!file || !file.body) {
      return new Response(JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ambil bucket dinamis dari environment KV/R2 bindings
    const r2Bucket = env[bucketName];
    if (!r2Bucket) {
      return new Response(JSON.stringify({ success: false, error: `Bucket ${bucketName} tidak ditemukan` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    fileName = sanitize(fileName || file.name || `upload-${Date.now()}`);

    await r2Bucket.put(fileName, file.body, { httpMetadata: { contentType: file.type || "application/octet-stream" } });

    return new Response(JSON.stringify({
      success: true,
      bucketName,
      fileName,
      publicUrl: `https://pub-${env.ACCOUNT_ID}.r2.dev/${bucketName}/${encodeURIComponent(fileName)}`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== DELETE FILE =====================
async function handleDelete(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const data = await request.json();
    const { bucketName, fileName } = data;

    if (!bucketName) {
      return new Response(JSON.stringify({ success: false, error: "Bucket tidak boleh kosong" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const r2Bucket = env[bucketName];
    if (!r2Bucket) {
      return new Response(JSON.stringify({ success: false, error: `Bucket ${bucketName} tidak ditemukan` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await r2Bucket.delete(fileName);

    return new Response(JSON.stringify({ success: true, message: "File dihapus", bucketName, fileName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== UTILITY =====================
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_\-./()[\]]/g, "_").replace(/\.\./g, "_").substring(0, 200);
}
