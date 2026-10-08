import assert from "node:assert/strict";
import { fileResourceChunk } from "../src/file-resources.js";

// The Go Execution Core sends its tool value inside an MCP text-result envelope.
// Legacy TS fixtures may return the same fields as a direct object.
const direct = {
  path: "/tmp/example.bin",
  mime_type: "application/octet-stream",
  encoding: "base64",
  size: 3,
  file_revision: "revision-123",
  offset: 0,
  bytes_read: 3,
  eof: true,
  chunk_sha256: "irrelevant-for-normalization",
  data: "QUJD",
};

const envelope = {
  content: [{ type: "text", text: JSON.stringify(direct) }],
};

assert.deepEqual(fileResourceChunk(direct), direct, "direct binary chunk");
assert.deepEqual(fileResourceChunk(envelope), direct, "Go MCP text envelope");
assert.equal(fileResourceChunk(envelope).file_revision, direct.file_revision);
assert.equal(fileResourceChunk(envelope).data, "QUJD");

const later = { ...direct, offset: 2, bytes_read: 1, data: "Qw==", eof: true };
assert.deepEqual(
  fileResourceChunk({ content: [{ type: "text", text: JSON.stringify(later) }] }),
  later,
  "streamed range chunk uses the same decoder",
);

for (const invalid of [
  null,
  { content: [] },
  { isError: true, content: [{ type: "text", text: JSON.stringify(direct) }] },
  { content: [{ type: "text", text: "not json" }] },
  { ...direct, encoding: "utf8" },
  { ...direct, file_revision: "" },
]) {
  assert.throws(
    () => fileResourceChunk(invalid),
    /valid binary file resource descriptor/,
  );
}
console.log("File resource binary result normalization: passed");
