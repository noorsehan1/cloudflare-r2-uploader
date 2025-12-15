// ===================== UPLOAD IMAGE WORKER PUBLISHABLE =====================
// Upload ke R2: feed, userimage, storage
// X-Auth-Key = env.UPLOAD_SECRET (misal: "alfiyan")
// Public URL otomatis bisa diakses browser

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(env);
    }

    // Upload
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    return new Response("Not Found. Gunakan POST /upload", { status: 404 });
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
    // AUTH
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PARSE FORM DATA
    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName"); // "feed", "userimage", "storage"

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PILIH BUCKET
    let r2Bucket;
    switch ((bucketName || "").toLowerCase()) {
      case "feed": r2Bucket = env.R2_BUCKET_FEED; break;
      case "userimage": r2Bucket = env.R2_BUCKET_USERIMAGE; break;
      case "storage": r2Bucket = env.R2_BUCKET_STORAGE; break;
      default:
        return new Response(JSON.stringify({ success: false, error: "Bucket tidak valid" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // NAMA FILE
    const finalFileName = sanitizeFileName(fileName || file.name || `upload-${Date.now()}`);
    const objectKey = finalFileName;

    // UPLOAD
    const contentType = file.type || "application/octet-stream";
    await r2Bucket.put(objectKey, file.body, { httpMetadata: { contentType } });

    // GENERATE PUBLIC URL
    const publicUrl = `https://${env.ACCOUNT_ID}.r2.dev/${bucketName}/${objectKey}`;

    return new Response(JSON.stringify({
      success: true,
      message: "Upload berhasil!",
      fileName: finalFileName,
      objectKey,
      bucket: bucketName,
      publicUrl
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: `Upload gagal: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== BANTUAN =====================
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_")
             .replace(/\.\./g, "_")
             .substring(0, 200);
}
