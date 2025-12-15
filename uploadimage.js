// ===================== UPLOAD IMAGE WORKER =====================
// Worker ini menangani upload ke 3 bucket R2: feed, userimage, storage
// Gunakan X-Auth-Key = env.UPLOAD_SECRET (misal: "alfiyan")
// CORS diizinkan sesuai env.ALLOWED_ORIGIN

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

    return new Response("Not Found. Gunakan POST /upload", { status: 404 });
  },
};

// ===================== FUNGSI CORS =====================
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

// ===================== FUNGSI UPLOAD =====================
async function handleUpload(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    // Verifikasi autentikasi
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Token tidak valid" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName"); // Harus: "R2_BUCKET_FEED", "R2_BUCKET_USERIMAGE", "R2_BUCKET_STORAGE"

    if (!file || typeof file === "string") {
      return new Response(
        JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ambil bucket dari binding
    const r2Bucket = env[bucketName];
    if (!r2Bucket) {
      return new Response(
        JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tentukan nama file akhir
    const finalFileName = sanitizeFileName(fileName || file.name || `upload-${Date.now()}`);
    const objectKey = finalFileName;

    // Upload ke R2
    await r2Bucket.put(objectKey, file.body, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Upload berhasil!",
        fileName: finalFileName,
        objectKey: objectKey,
        bucket: bucketName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: `Upload gagal: ${error.message || "Unknown error"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ===================== FUNGSI BANTUAN =====================
function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_") // hanya karakter aman
    .replace(/\.\./g, "_")                     // blok path traversal
    .substring(0, 200);                        // batasi panjang nama
}
