export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(env);
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      return upload(request, env);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      return remove(request, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// ================= CORS =================
function cors(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key"
    }
  });
}

// ================= UPLOAD =================
async function upload(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    // AUTH
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized"
      }), { status: 401, headers });
    }

    const form = await request.formData();
    const file = form.get("file");
    let fileName = form.get("fileName");

    // VALIDASI FILE (BENAR)
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({
        success: false,
        error: "File tidak valid"
      }), { status: 400, headers });
    }

    fileName = sanitize(fileName || file.name || `upload-${Date.now()}`);

    const buffer = await file.arrayBuffer();

    await env.R2_BUCKET_USERIMAGE.put(fileName, buffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream"
      }
    });

    return new Response(JSON.stringify({
      success: true,
      fileName
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), { status: 500, headers });
  }
}

// ================= DELETE =================
async function remove(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Content-Type": "application/json"
  };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized"
      }), { status: 401, headers });
    }

    const { fileName } = await request.json();

    if (!fileName) {
      return new Response(JSON.stringify({
        success: false,
        error: "fileName kosong"
      }), { status: 400, headers });
    }

    await env.R2_BUCKET_USERIMAGE.delete(fileName);

    return new Response(JSON.stringify({
      success: true
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), { status: 500, headers });
  }
}

// ================= UTIL =================
function sanitize(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-./]/g, "_")
    .replace(/\.\./g, "_")
    .substring(0, 200);
}
