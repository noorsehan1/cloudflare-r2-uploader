export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleCors(env);

    if (url.pathname === "/upload" && request.method === "POST") return handleUpload(request, env);
    if (url.pathname === "/delete" && request.method === "POST") return handleDelete(request, env);

    return new Response("Not Found. Gunakan POST /upload atau /delete", { status: 404 });
  },
};

function handleCors(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function handleUpload(request, env) {
  const headers = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });

    const formData = await request.formData();
    const file = formData.get("file");
    const fileName = formData.get("fileName");
    const bucketName = formData.get("bucketName");

    if (!file || typeof file === "string") 
      return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers });

    const r2Bucket = env[bucketName];
    if (!r2Bucket)
      return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers });

    const finalFileName = sanitizeFileName(fileName || file.name || `upload-${Date.now()}`);
    await r2Bucket.put(finalFileName, file.body, { httpMetadata: { contentType: file.type || "application/octet-stream" } });

    return new Response(JSON.stringify({
      success: true,
      message: "Upload berhasil!",
      fileName: finalFileName,
      bucket: bucketName,
      publicUrl: `https://pub-${env.ACCOUNT_ID}.r2.dev/${finalFileName}`
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers });
  }
}

async function handleDelete(request, env) {
  const headers = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET)
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });

    const data = await request.json();
    const { fileName, bucketName } = data;

    const r2Bucket = env[bucketName];
    if (!r2Bucket)
      return new Response(JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }), { status: 400, headers });

    await r2Bucket.delete(fileName);

    return new Response(JSON.stringify({ success: true, message: "File berhasil dihapus", fileName, bucketName }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), { status: 500, headers });
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_\-.()[\]]/g, "_").replace(/\.\./g, "_").substring(0, 200);
}
