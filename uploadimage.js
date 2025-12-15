// ===================== KONFIGURASI =====================
// HARUS diatur di Dashboard Worker -> Settings -> Variables
// R2_BUCKET_FEED      → binding ke bucket feed
// R2_BUCKET_USERIMAGE → binding ke bucket userimage
// R2_BUCKET_STORAGE   → binding ke bucket storage
// UPLOAD_SECRET       → kata sandi sederhana untuk autentikasi
// ALLOWED_ORIGIN      → asal untuk CORS, misal "*" untuk development

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight(request, env);
    }

    // Upload POST
    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    // Default
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
  const corsHeaders = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  };

  try {
    // 1️⃣ Verifikasi autentikasi
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Token tidak valid" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2️⃣ Parse form data
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

    // 3️⃣ Tentukan nama file
    const finalFileName = fileName && fileName.trim() !== "" 
      ? sanitizeFileName(fileName.trim()) 
      : sanitizeFileName(file.name || `upload-${Date.now()}`);

    const objectKey = finalFileName; // nama file di bucket, path di bucketPath

    // 4️⃣ Pilih bucket sesuai bucketPath
    let bucket;
    switch(bucketPath) {
      case "feed":
        bucket = env.R2_BUCKET_FEED;
        break;
      case "storage":
        bucket = env.R2_BUCKET_STORAGE;
        break;
      case "userimage":
      default:
        bucket = env.R2_BUCKET_USERIMAGE;
        break;
    }

    // 5️⃣ Upload file ke bucket
    await bucket.put(objectKey, file.body, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    // 6️⃣ Respons sukses
    return new Response(
      JSON.stringify({
        success: true,
        message: "Upload berhasil!",
        fileName: finalFileName,
        objectKey: objectKey,
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

// ===================== FUNGSI BANTUAN =====================
function sanitizeFileName(fileName) {
  return fileName
    .replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_")  // karakter aman
    .replace(/\.\./g, "_")                     // blok path traversal
    .substring(0, 200);                        // batasi panjang
}
