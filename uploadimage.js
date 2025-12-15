export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
        }
      });
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      return upload(request, env);
    }

    if (url.pathname === "/delete" && request.method === "POST") {
      return del(request, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

async function upload(request, env) {
  if (request.headers.get("X-Auth-Key") !== env.UPLOAD_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  let fileName = form.get("fileName");

  if (!file || !file.body) {
    return new Response(JSON.stringify({ error: "File tidak valid" }), { status: 400 });
  }

  fileName = sanitize(fileName || file.name);

  await env.R2_BUCKET_USERIMAGE.put(fileName, file.body, {
    httpMetadata: { contentType: file.type }
  });

  return new Response(JSON.stringify({
    success: true,
    fileName: fileName
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function del(request, env) {
  if (request.headers.get("X-Auth-Key") !== env.UPLOAD_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { fileName } = await request.json();
  await env.R2_BUCKET_USERIMAGE.delete(fileName);

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_\-./]/g, "_").replace(/\.\./g, "_");
}
