// ===================== CLOUDRFARE R2 WORKER =====================
// Menangani upload dan delete file di bucket R2
// X-Auth-Key = env.UPLOAD_SECRET
// CORS sesuai env.ALLOWED_ORIGIN

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") return handleCorsPreflight(env);

    // Upload file
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    // Delete file
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
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName");

    if (!file || typeof file === "string") return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const r2Bucket = env[bucketName];
    if (!r2Bucket) return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Tambahkan prefix bucket agar URL publik benar
    const finalFileName = sanitizeFileName(fileName || file.name || `upload-${Date.now()}`);
    const objectKey = `${bucketName}/${finalFileName}`;

    await r2Bucket.put(objectKey, file.body, { httpMetadata: { contentType: file.type || "application/octet-stream" } });

    return new Response(JSON.stringify({
      success: true,
      message: "Upload berhasil!",
      fileName: finalFileName,
      bucket: bucketName,
      publicUrl: `https://pub-${env.ACCOUNT_ID}.r2.dev/${objectKey}`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };
  try {
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const data = await request.json();
    const { fileName, bucketName } = data;

    const r2Bucket = env[bucketName];
    if (!r2Bucket) return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const objectKey = `${bucketName}/${fileName}`;
    await r2Bucket.delete(objectKey);

    return new Response(JSON.stringify({ success: true, message: "File berhasil dihapus", fileName, bucket: bucketName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

// ===================== BANTUAN =====================
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_").replace(/\.\./g, "_").substring(0, 200);
}
