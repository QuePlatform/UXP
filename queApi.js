/* Prettier width 80 */
function parseBucketFromPresignedUrl(url) {
    const u = new URL(url);
    const host = u.host; // e.g., que-assets-dev.s3.us-east-2.amazonaws.com
    const parts = host.split(".");
    // virtual-hosted-style: <bucket>.s3.<region>.amazonaws.com
    if (parts.length >= 4 && parts[1] === "s3") {
      return parts[0];
    }
    // path-style: s3.<region>.amazonaws.com/<bucket>/...
    // fall back to first path segment
    const pathSegs = u.pathname.split("/").filter(Boolean);
    if (pathSegs.length > 0) return pathSegs[0];
    throw new Error("Unable to parse S3 bucket from presigned URL.");
  }
  
  export function createQueApi(opts) {
    const apiBase = opts.apiBase.replace(/\/$/, "");
    const apiKey = opts.apiKey;
  
    async function request(path, init) {
      const res = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          ...(init && init.headers)
        }
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(
          `HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 1000)}`
        );
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return res.json();
      return res.text();
    }
  
    return {
      async presignUpload() {
        const j = await request("/v1/assets/presign", { method: "POST" });
        const bucket = parseBucketFromPresignedUrl(j.url);
        return { ...j, bucket };
      },
  
      async uploadToS3Put(url, bytes, contentType) {
        const res = await fetch(url, {
          method: "PUT",
          body: bytes,
          headers: {
            "content-type": contentType || "application/octet-stream"
          }
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(
            `S3 PUT failed ${res.status} ${res.statusText}: ${txt}`
          );
        }
        return true;
      },
  
      async signAsset(bucket, key, manifestJson) {
        const payload = {
          asset: { bucket, key },
          mode: "server_measure",
          manifest_json: manifestJson
        };
        return request("/v1/sign", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      },
  
      // Requires you to add the /v1/assets/presign-download endpoint (see Part D)
      async presignDownload(bucket, key) {
        const payload = { bucket, key };
        return request("/v1/assets/presign-download", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
    };
  }