import { createQueApi } from "./queAPi";

const { localFileSystem, formats } = require("uxp").storage;

let pickedFile = null;
let lastSigned = null;

function log(msg) {
  const el = document.getElementById("log");
  el.textContent += `${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function getApi() {
  const apiBase = document.getElementById("apiBase").value.trim();
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!apiBase || !apiKey) throw new Error("Set API Base and API Key.");
  return createQueApi({ apiBase, apiKey });
}

document.getElementById("pick").addEventListener("click", async () => {
  try {
    const file = await localFileSystem.getFileForOpening({
      allowMultiple: false
    });
    if (!file) return;
    pickedFile = file;
    document.getElementById("sign").disabled = false;
    log(`Picked: ${file.name}`);
  } catch (e) {
    log(`Pick error: ${e.message}`);
  }
});

document.getElementById("sign").addEventListener("click", async () => {
  try {
    if (!pickedFile) throw new Error("Pick a file first.");
    const api = getApi();

    const manifestEl = document.getElementById("manifest");
    const manifestText = manifestEl.value.trim() || "{}";
    // Validate manifest is valid JSON string content
    JSON.parse(manifestText);

    log("Requesting presigned upload URL...");
    const { url, key, bucket } = await api.presignUpload();

    log("Reading local file...");
    const bytes = await pickedFile.read({ format: formats.binary });
    const contentType = inferContentType(pickedFile.name);

    log("Uploading to S3 (PUT)...");
    await api.uploadToS3Put(url, bytes, contentType);

    log("Calling /v1/sign...");
    const signResp = await api.signAsset(bucket, key, manifestText);
    log(`Sign response: ${JSON.stringify(signResp, null, 2)}`);

    const s3uri = signResp.asset_s3_uri;
    if (!s3uri) throw new Error("No asset_s3_uri in response.");
    const { bkt, ky } = parseS3Uri(s3uri);

    log("Requesting download URL...");
    const dl = await api.presignDownload(bkt, ky);
    lastSigned = { url: dl.url, suggestedName: suggestSignedName(pickedFile) };

    document.getElementById("save").disabled = false;
    log("Ready to save signed file.");
  } catch (e) {
    log(`Error: ${e.message}`);
  }
});

document.getElementById("save").addEventListener("click", async () => {
  try {
    if (!lastSigned) throw new Error("Nothing to save.");
    const dest = await localFileSystem.getFileForSaving(
      lastSigned.suggestedName
    );
    if (!dest) return;

    log("Downloading signed bytes...");
    const res = await fetch(lastSigned.url);
    if (!res.ok) throw new Error(`GET failed: ${res.statusText}`);
    const arr = await res.arrayBuffer();

    log("Writing file...");
    await dest.write(arr, { format: formats.binary });

    log("Saved signed file.");
  } catch (e) {
    log(`Save error: ${e.message}`);
  }
});

function parseS3Uri(s3uri) {
  const no = s3uri.replace(/^s3:\/\//, "");
  const parts = no.split("/");
  const bkt = parts.shift();
  const ky = parts.join("/");
  return { bkt, ky };
}

function inferContentType(name) {
  const low = name.toLowerCase();
  if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return "image/jpeg";
  if (low.endsWith(".png")) return "image/png";
  if (low.endsWith(".tif") || low.endsWith(".tiff")) return "image/tiff";
  if (low.endsWith(".webp")) return "image/webp";
  if (low.endsWith(".heic") || low.endsWith(".heif")) return "image/heif";
  if (low.endsWith(".mp4")) return "video/mp4";
  if (low.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function suggestSignedName(file) {
  const n = file.name;
  const dot = n.lastIndexOf(".");
  if (dot === -1) return `${n}-signed`;
  return `${n.slice(0, dot)}-signed${n.slice(dot)}`;
}