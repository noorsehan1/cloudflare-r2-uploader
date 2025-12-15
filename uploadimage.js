// ===================== CLOUDRFARE R2 WORKER =====================
// Worker ini menangani upload dan delete file di bucket R2
// X-Auth-Key = env.UPLOAD_SECRET
// CORS sesuai env.ALLOWED_ORIGIN

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(env);
    }

    // Handle upload
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    // Handle delete
    if (url.pathname === "/delete" && request.method === "POST") {
      return handleDelete(request, env);
    }

    return new Response("Not Found. Gunakan POST /upload atau /delete", { status: 404 });
  },
};

// ===================== CORS =====================
function handleCorsPreflight(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ===================== UPLOAD =====================
async function handleUpload(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };
  try {
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName");

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mapping nama bucket client ke binding R2
    let r2Bucket;
    switch ((bucketName || "").toLowerCase()) {
      case "feed": r2Bucket = env.R2_BUCKET_FEED; break;
      case "userimage": r2Bucket = env.R2_BUCKET_USERIMAGE; break;
      case "storage": r2Bucket = env.R2_BUCKET_STORAGE; break;
      default:
        return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const finalFileName = sanitizeFileName(fileName || file.name || `upload-${Date.now()}`);
    const arrayBuffer = await file.arrayBuffer(); // pastikan file tidak 0 KB
    await r2Bucket.put(finalFileName, arrayBuffer, { httpMetadata: { contentType: file.type || "application/octet-stream" } });

    return new Response(JSON.stringify({ success: true, message: "Upload berhasil!", fileName: finalFileName, bucket: bucketName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };
  try {
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await request.json();
    const { fileName, bucketName } = data;

    // Mapping nama bucket client ke binding R2
    let r2Bucket;
    switch ((bucketName || "").toLowerCase()) {
      case "feed": r2Bucket = env.R2_BUCKET_FEED; break;
      case "userimage": r2Bucket = env.R2_BUCKET_USERIMAGE; break;
      case "storage": r2Bucket = env.R2_BUCKET_STORAGE; break;
      default:
        return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await r2Bucket.delete(fileName);

    return new Response(JSON.stringify({ success: true, message: "File berhasil dihapus", fileName, bucket: bucketName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== BANTUAN =====================
function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_")
    .replace(/\.\./g, "_")
    .substring(0, 200);
}
