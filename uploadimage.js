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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// ===================== MIME FALLBACK =====================
function getMime(path) {
  const p = path.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
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
      return new Response(JSON.stringify({ success: false }), { status: 401, headers });
    }

    const form = await request.formData();
    const file = form.get("file");
    const subFolder = form.get("subFolder") || "";
    const fileName = form.get("fileName");

    if (!(file instanceof File) || !fileName) {
      return new Response(JSON.stringify({ success: false }), { status: 400, headers });
    }

    const fullPath = subFolder ? `${subFolder}/${fileName}` : fileName;
    const buffer = await file.arrayBuffer();

    await env.R2_BUCKET_USERIMAGE.put(fullPath, buffer, {
      httpMetadata: {
        contentType: file.type || getMime(fullPath)
      }
    });

    return new Response(JSON.stringify({
      success: true,
      filePath: fullPath
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
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
      return new Response(JSON.stringify({ success: false }), { status: 401, headers });
    }

    const { publicUrl } = await request.json();
    let path = decodeURIComponent(new URL(publicUrl).pathname);
    if (path.startsWith("/")) path = path.slice(1);

    await env.R2_BUCKET_USERIMAGE.delete(path);

    return new Response(JSON.stringify({
      success: true,
      deletedPath: path
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

// ===================== DOWNLOAD (PREVIEW ENABLED) =====================
async function handleDownload(request, env) {
  const headers = {
    "Access-Control-Allow-Origin": "*"
  };

  const url = new URL(request.url);
  const filePath = url.searchParams.get("file");

  if (!filePath) {
    return new Response("file missing", { status: 400, headers });
  }

  const object = await env.R2_BUCKET_USERIMAGE.get(filePath);
  if (!object) {
    return new Response("Not Found", { status: 404, headers });
  }

  const contentType =
    object.httpMetadata?.contentType || getMime(filePath);

  return new Response(object.body, {
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000"
    }
  });
}
