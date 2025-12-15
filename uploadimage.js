export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors(env);
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      return handleDelete(request, env);
    }

    return new Response(
      "Not Found. Gunakan POST /upload atau /delete",
      { status: 404 }
    );
  }
};

// ===================== CORS =====================
function handleCors(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// ===================== UPLOAD =====================
async function handleUpload(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    // AUTH
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    let fileName = formData.get("fileName"); // contoh: imageroom/foto.jpg

    if (!file || !file.body) {
      return new Response(
        JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const bucket = env.R2_BUCKET_USERIMAGE;
    if (!bucket) {
      return new Response(
        JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }),
        { status: 500, headers: corsHeaders }
      );
    }

    fileName = sanitize(fileName || file.name || `upload-${Date.now()}`);

    await bucket.put(fileName, file.body, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream"
      }
    });

    const publicUrl =
      `https://pub-${env.ACCOUNT_ID}.r2.dev/userimage/${encodeURIComponent(fileName)}`;

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        publicUrl
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    // AUTH
    const auth = request.headers.get("X-Auth-Key");
    if (!env.UPLOAD_SECRET || auth !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const data = await request.json();
    const { fileName } = data;

    if (!fileName) {
      return new Response(
        JSON.stringify({ success: false, error: "fileName kosong" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const bucket = env.R2_BUCKET_USERIMAGE;
    if (!bucket) {
      return new Response(
        JSON.stringify({ success: false, error: "Bucket tidak ditemukan" }),
        { status: 500, headers: corsHeaders }
      );
    }

    await bucket.delete(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        message: "File berhasil dihapus",
        fileName
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// ===================== UTIL =====================
function sanitize(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-./]/g, "_")
    .replace(/\.\./g, "_")
    .substring(0, 200);
}
