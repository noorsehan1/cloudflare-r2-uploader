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
    // AUTH
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const subFolder = form.get("subFolder") || "";
    const fileName = form.get("fileName");

    // VALIDASI FILE (BENAR UNTUK WORKERS)
    if (!(file instanceof File)) {
      return new Response(
        JSON.stringify({ success: false, error: "File tidak valid" }),
        { status: 400, headers }
      );
    }

    if (!fileName) {
      return new Response(
        JSON.stringify({ success: false, error: "fileName kosong" }),
        { status: 400, headers }
      );
    }

    // GABUNG SUBFOLDER + FILENAME
    const fullPath = sanitize(
      subFolder ? `${subFolder}/${fileName}` : fileName
    );

    // BACA FILE
    const buffer = await file.arrayBuffer();

    // UPLOAD KE R2
    await env.R2_BUCKET_USERIMAGE.put(fullPath, buffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream"
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        filePath: fullPath
      }),
      { status: 200, headers }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers }
    );
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    // AUTH
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const data = await request.json();
    const subFolder = data.subFolder || "";
    const fileName = data.fileName;

    if (!fileName) {
      return new Response(
        JSON.stringify({ success: false, error: "fileName kosong" }),
        { status: 400, headers }
      );
    }

    const fullPath = sanitize(
      subFolder ? `${subFolder}/${fileName}` : fileName
    );

    await env.R2_BUCKET_USERIMAGE.delete(fullPath);

    return new Response(
      JSON.stringify({
        success: true,
        filePath: fullPath
      }),
      { status: 200, headers }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers }
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
