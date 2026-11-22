/**
 * Prints the structure of a GLB: node names, root transforms, meshes and material names.
 *
 * Run: node tools/anatomy/inspect-glb.mjs <file.glb>
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (path === undefined) {
  console.error("usage: node tools/anatomy/inspect-glb.mjs <file.glb>");
  process.exit(2);
}

const buffer = readFileSync(path);
// glTF magic is 0x46546C67 little-endian "glTF".
if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.slice(20, 20 + jsonLength).toString("utf8"));
const scenes = json.scenes ?? [];
const nodes = json.nodes ?? [];
console.log("generator:", (json.asset ?? {}).generator ?? "unknown");
console.log("nodes:", nodes.length, "meshes:", (json.meshes ?? []).length, "materials:", (json.materials ?? []).length);
const materials = (json.materials ?? []).map((material) => material.name);
console.log("materials:", materials.join(", "));
const rootNodes = (scenes[0] ?? { nodes: [] }).nodes ?? [];
const walk = (index, depth) => {
  const node = nodes[index];
  if (node === undefined) return;
  const parts = ["  ".repeat(depth) + (node.name ?? `<node ${index}>`)];
  if (node.rotation !== undefined) parts.push(`rot ${JSON.stringify(node.rotation)}`);
  if (node.scale !== undefined) parts.push(`scale ${JSON.stringify(node.scale)}`);
  if (node.mesh !== undefined) parts.push("mesh");
  console.log(parts.join(" · "));
  for (const child of node.children ?? []) walk(child, depth + 1);
};
for (const index of rootNodes) walk(index, 0);
