// glip annotation store — one JSON file per annotation (git-friendly,
// Obsidian-readable, trivially backed up). Swap this module for PocketBase /
// Postgres later without touching routes: they only use list/get/save/remove.
//
// Location: GLIP_NOTES_DIR, default <repo>/data/annotations
// (VPS: /opt/glip/data/annotations, or /opt/packages/glip/data/annotations).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { normalizeAnnotation, summarize, isValidId, makeId } from '$glip/glip-core.js';

type Annotation = import('$glip/glip-core.js').Annotation;

const DIR = path.resolve(env.GLIP_NOTES_DIR || path.join(process.cwd(), '../../data/annotations'));
const TRASH = path.join(DIR, '.trash');

let cache: Map<string, Annotation> | null = null;

async function ensureDir() {
	await fs.mkdir(DIR, { recursive: true });
}

function fileFor(id: string) {
	if (!isValidId(id)) throw new Error('invalid id');
	return path.join(DIR, `${id}.json`);
}

async function loadAll(): Promise<Map<string, Annotation>> {
	if (cache) return cache;
	await ensureDir();
	const map = new Map<string, Annotation>();
	for (const name of await fs.readdir(DIR)) {
		if (!name.endsWith('.json')) continue;
		try {
			const raw = JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8'));
			const a = normalizeAnnotation(raw, { id: name.slice(0, -5), now: raw.updated, previous: raw });
			map.set(a.id, a);
		} catch (e) {
			console.warn(`[glip] skipping ${name}:`, e instanceof Error ? e.message : e);
		}
	}
	cache = map;
	return map;
}

export async function listAnnotations() {
	const all = [...(await loadAll()).values()];
	all.sort((a, b) => b.updated.localeCompare(a.updated));
	return all;
}

export async function listSummaries() {
	return (await listAnnotations()).map(summarize);
}

export async function getAnnotation(id: string): Promise<Annotation | null> {
	if (!isValidId(id)) return null;
	return (await loadAll()).get(id) ?? null;
}

/** Creates (no id) or replaces (id) an annotation; returns the sanitised record. */
export async function saveAnnotation(input: unknown, id?: string): Promise<Annotation> {
	const map = await loadAll();
	const previous = id ? map.get(id) ?? null : null;
	if (id && !previous) throw Object.assign(new Error('not found'), { status: 404 });
	let newId = id;
	if (!newId) {
		do newId = makeId(); while (map.has(newId));
	}
	const a = normalizeAnnotation(input, { id: newId, previous });
	const file = fileFor(a.id);
	const tmp = `${file}.${process.pid}.tmp`;
	await ensureDir();
	await fs.writeFile(tmp, JSON.stringify(a, null, '\t') + '\n', 'utf8');
	await fs.rename(tmp, file);
	map.set(a.id, a);
	return a;
}

/** Soft delete: moves the file to .trash/. */
export async function removeAnnotation(id: string): Promise<boolean> {
	const map = await loadAll();
	if (!map.has(id)) return false;
	await fs.mkdir(TRASH, { recursive: true });
	await fs.rename(fileFor(id), path.join(TRASH, `${id}.${Date.now()}.json`));
	map.delete(id);
	return true;
}

export function storeLocation() {
	return DIR;
}
