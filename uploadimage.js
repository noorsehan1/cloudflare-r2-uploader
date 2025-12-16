export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleCors(env);
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      return handleDelete(request, env);
    }

    return new Response("Not Found", { status: 404 });
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
  const headers = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });
    }

    const form = await request.formData();
    const file = form.get("file");
    const subFolder = form.get("subFolder") || "";
    const fileName = form.get("fileName"); // Nama persis

    if (!(file instanceof File)) return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers });
    if (!fileName) return new Response(JSON.stringify({ success: false, error: "fileName kosong" }), { status: 400, headers });

    // 🔥 Tambahkan .png jika fileName tidak punya ekstensi
    let actualFileName = fileName;
    if (!/\.[a-zA-Z0-9]+$/.test(fileName)) {
      actualFileName += ".png";
    }

    const fullPath = subFolder ? `${subFolder}/${actualFileName}` : actualFileName;

    const buffer = await file.arrayBuffer();

    await env.R2_BUCKET_USERIMAGE.put(fullPath, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" }
    });

    return new Response(JSON.stringify({ success: true, filePath: fullPath }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });

    const { publicUrl } = await request.json();
    if (!publicUrl) return new Response(JSON.stringify({ success: false, error: "publicUrl kosong" }), { status: 400, headers });

    let filePath = decodeURIComponent(new URL(publicUrl).pathname);
    if (filePath.startsWith("/")) filePath = filePath.slice(1);

    await env.R2_BUCKET_USERIMAGE.delete(filePath);

    return new Response(JSON.stringify({ success: true, deletedPath: filePath }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}
