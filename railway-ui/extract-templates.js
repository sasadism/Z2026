/*
 * extract-templates.js
 *
 * Regenerates the static panel HTML pages in ./public from the canonical
 * Cloudflare Worker source (../Source.js). The Worker keeps every page as a
 * template literal inside the HTML_TEMPLATES object, interpolating three shared
 * constants (COMMON_HEAD, COMMON_TOAST_HTML, COMMON_TOAST_JS). We parse the
 * source with acorn, evaluate just those declarations in an isolated VM
 * context, and write the fully-inlined HTML to disk.
 *
 * Run:  node extract-templates.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const acorn = require("acorn");

const SOURCE = path.join(__dirname, "..", "Source.js");
const OUT = path.join(__dirname, "public");

const src = fs.readFileSync(SOURCE, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });

const WANT = new Set(["COMMON_HEAD", "COMMON_TOAST_HTML", "COMMON_TOAST_JS", "HTML_TEMPLATES"]);
const snippets = [];
for (const node of ast.body) {
	if (node.type !== "VariableDeclaration") continue;
	for (const decl of node.declarations) {
		if (decl.id && decl.id.name && WANT.has(decl.id.name)) {
			// Grab the exact source text of the declaration (const NAME = ...).
			snippets.push("const " + src.slice(decl.start, decl.end));
		}
	}
}

const code = snippets.join(";\n") + ";\nmodule.exports = HTML_TEMPLATES;";
const sandbox = { module: {}, exports: {} };
vm.createContext(sandbox);
new vm.Script(code).runInContext(sandbox);
const templates = sandbox.module.exports;

fs.mkdirSync(OUT, { recursive: true });
const pages = ["nginx", "setup", "login", "panel"];
for (const name of pages) {
	if (typeof templates[name] !== "string") {
		throw new Error("Template not found or not a string: " + name);
	}
	const file = path.join(OUT, name + ".html");
	fs.writeFileSync(file, templates[name].replace(/^\n/, ""));
	console.log("wrote", path.relative(process.cwd(), file), "(" + templates[name].length + " bytes)");
}
console.log("Done. Regenerated", pages.length, "pages from", path.relative(process.cwd(), SOURCE));
