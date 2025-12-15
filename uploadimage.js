export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleCorsPreflight(env);
    if (url.pathname === "/upload" && request.method === "POST") return handleUpload(request, env);

    return new Response("Not Found. Gunakan POST /upload", { status: 404 });
  }
};

function handleCorsPreflight(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400",
    }
  });
}

async function handleUpload(request, env) {
  const corsHeaders = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    const authHeader = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || authHeader !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Token tidak valid" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName");

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let r2Bucket;
    switch ((bucketName || "").toLowerCase()) {
      case "feed": r2Bucket = env.R2_BUCKET_FEED; break;
      case "userimage": r2Bucket = env.R2_BUCKET_USERIMAGE; break;
      case "storage": r2Bucket = env.R2_BUCKET_STORAGE; break;
      default:
        return new Response(JSON.stringify({ success: false, error: "Bucket tidak valid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const finalFileName = fileName && fileName.trim() !== "" ? sanitizeFileName(fileName.trim()) : sanitizeFileName(file.name || `upload-${Date.now()}`);
    const objectKey = finalFileName;

    await r2Bucket.put(objectKey, file.body, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    return new Response(JSON.stringify({ success: true, message: "Upload berhasil!", fileName: finalFileName, objectKey, bucket: bucketName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: `Upload gagal: ${error.message || "Unknown error"}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_").replace(/\.\./g, "_").substring(0, 200);
}
