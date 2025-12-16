export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
        },
      });
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      return handleDelete(request, env);
    }

    if (url.pathname === "/download" && request.method === "GET") {
      return handleDownload(url, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ===================== UPLOAD =====================
async function handleUpload(request, env) {
  const headers = { "Content-Type": "application/json" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });
    }

    const form = await request.formData();
    const file = form.get("file");
    const subFolder = form.get("subFolder") || "";
    const fileName = form.get("fileName");

    if (!(file instanceof File)) return new Response(JSON.stringify({ success: false, error: "File tidak valid" }), { status: 400, headers });
    if (!fileName) return new Response(JSON.stringify({ success: false, error: "fileName kosong" }), { status: 400, headers });

    // 🔥 Nama asli persis
    const fullPath = subFolder ? `${subFolder}/${fileName}` : fileName;

    const buffer = await file.arrayBuffer();

    await env.R2_BUCKET_USERIMAGE.put(fullPath, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    return new Response(JSON.stringify({ success: true, filePath: fullPath }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}

// ===================== DELETE =====================
async function handleDelete(request, env) {
  const headers = { "Content-Type": "application/json" };

  try {
    const auth = request.headers.get("X-Auth-Key");
    if (auth !== env.UPLOAD_SECRET) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers });

    const { filePath } = await request.json();
    if (!filePath) return new Response(JSON.stringify({ success: false, error: "filePath kosong" }), { status: 400, headers });

    await env.R2_BUCKET_USERIMAGE.delete(filePath);

    return new Response(JSON.stringify({ success: true, deletedPath: filePath }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
  }
}

// ===================== DOWNLOAD PUBLIK =====================
async function handleDownload(url, env) {
  const filePath = url.searchParams.get("file"); // Ambil file dari query
  if (!filePath) return new Response("File parameter missing", { status: 400 });

  try {
    const object = await env.R2_BUCKET_USERIMAGE.get(filePath);
    if (!object) return new Response("File not found", { status: 404 });

    const contentType = object.httpMetadata.contentType || "application/octet-stream";
    const body = await object.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // Bisa di-cache lama
      },
    });
  } catch (e) {
    return new Response("Error: " + e.message, { status: 500 });
  }
}
