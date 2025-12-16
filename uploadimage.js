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

    if (url.pathname === "/download" && request.method === "GET") {
      return handleDownload(request, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// ===================== CORS =====================
function handleCors(env) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// ===================== UPLOAD =====================
async function handleUpload(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
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

    const form = await request.formData();
    const file = form.get("file");
    const subFolder = form.get("subFolder") || "";
    const fileName = form.get("fileName"); // 🔥 NAMA ASLI

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({
        success: false,
        error: "File tidak valid"
      }), { status: 400, headers });
    }

    if (!fileName) {
      return new Response(JSON.stringify({
        success: false,
        error: "fileName kosong"
      }), { status: 400, headers });
    }

    // 🔥 GABUNG TANPA UBAH NAMA
    const fullPath = subFolder
      ? `${subFolder}/${fileName}`
      : fileName;

    const buffer = await file.arrayBuffer();

    await env.R2_BUCKET_USERIMAGE.put(fullPath, buffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream"
      }
    });

    return new Response(JSON.stringify({
      success: true,
      filePath: fullPath
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), { status: 500, headers });
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
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

    const { publicUrl } = await request.json();
    if (!publicUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: "publicUrl kosong"
      }), { status: 400, headers });
    }

    // 🔥 Ambil path asli
    let filePath = decodeURIComponent(new URL(publicUrl).pathname);
    if (filePath.startsWith("/")) filePath = filePath.slice(1);

    await env.R2_BUCKET_USERIMAGE.delete(filePath);

    return new Response(JSON.stringify({
      success: true,
      deletedPath: filePath
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), { status: 500, headers });
  }
}

// ===================== DOWNLOAD (FIREBASE STYLE) =====================
async function handleDownload(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": "*"
  };

  const url = new URL(request.url);

  // 🔥 HANYA BACA file= , SIG DIABAIKAN
  const filePath = url.searchParams.get("file");

  if (!filePath) {
    return new Response("file parameter missing", { status: 400, headers });
  }

  const object = await env.R2_BUCKET_USERIMAGE.get(filePath);

  if (!object) {
    return new Response("Object not found", { status: 404, headers });
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000"
    }
  });
}
