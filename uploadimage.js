// ===================== KONFIGURASI =====================
// Worker akan membutuhkan binding bucket di Dashboard Worker:
// R2_BUCKET_FEED      → feed
// R2_BUCKET_USERIMAGE → userimage
// R2_BUCKET_STORAGE   → storage
// UPLOAD_SECRET = "alfiyan"
// ALLOWED_ORIGIN = "*"  (atau domain App Inventor)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1️⃣ Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(request, env);
    }

    // 2️⃣ Upload POST
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    // 3️⃣ Lainnya
    return new Response("Not Found. Gunakan POST /upload", { status: 404 });
  }
};

// ===================== FUNGSI CORS =====================
function handleCorsPreflight(request, env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400",
    }
  });
}

// ===================== FUNGSI UPLOAD =====================
async function handleUpload(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    // 🔒 Verifikasi secret
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Token tidak valid" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔹 Parse form data
    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketPath = formData.get("bucketPath") || "userimage"; // default bucket

    if (!file || typeof file === "string") {
      return new Response(
        JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔹 Tentukan nama file
    const finalFileName = fileName && fileName.trim() !== "" 
      ? sanitizeFileName(fileName.trim()) 
      : sanitizeFileName(file.name || `upload-${Date.now()}`);

    // 🔹 Pilih bucket
    let bucket;
    switch(bucketPath) {
      case "feed": bucket = env.R2_BUCKET_FEED; break;
      case "storage": bucket = env.R2_BUCKET_STORAGE; break;
      case "userimage":
      default: bucket = env.R2_BUCKET_USERIMAGE; break;
    }

    // 🔹 Upload ke R2
    await bucket.put(finalFileName, file.body, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    // 🔹 Respons sukses
    return new Response(
      JSON.stringify({
        success: true,
        message: "Upload berhasil!",
        fileName: finalFileName,
        bucket: bucketPath
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ success: false, error: `Upload gagal: ${error.message || "Unknown error"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ===================== BANTUAN =====================
function sanitizeFileName(fileName) {
  return fileName
    .replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_")
    .replace(/\.\./g, "_")
    .substring(0, 200);
}
