import dotenv from "dotenv";
import process from "process";
import fetch from "node-fetch";

interface CloudflareKey {
	name: string;
	expiration?: number;
	metadata?: Record<string, unknown>;
}

interface CloudflareKeysResponse {
	result: CloudflareKey[];
	success: boolean;
	errors: unknown[];
	messages: unknown[];
}

interface Entry {
	preferredLanguage: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	languages: string;
	program: string;
	rsg1: string;
	rsg2?: string;
	emergencyName: string;
	emergencyPhone: string;
	emergencyRelationship?: string;
	dob?: string;
	pronouns?: string;
	medical?: string;
	accessibility?: string;
	fullNameParticipant?: string;
	dateParticipant?: string;
	fullNameParent?: string;
	dateParent?: string;
	signaturePaths?: {
		signatureParticipant?: string;
		signatureParent?: string;
	};
}

dotenv.config();

const ACCOUNT_ID = process.env.ACCOUNT_ID;
const NAMESPACE_ID = process.env.NAMESPACE_ID;
const API_TOKEN = process.env.API_TOKEN;

if (!ACCOUNT_ID || !NAMESPACE_ID || !API_TOKEN) {
	throw new Error("Missing required env vars");
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt === retries - 1) throw err;
			await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
		}
	}
	throw lastErr;
}

async function fetchAllKeys(prefix?: string): Promise<string[]> {
	let url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/keys`;
	if (prefix) {
		url += `?prefix=${encodeURIComponent(prefix)}`;
	}
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${API_TOKEN}` },
	});
	const json = (await res.json()) as CloudflareKeysResponse;
	return json.result.map(k => k.name);
}

async function fetchEntry(key: string): Promise<Entry> {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/${key}`,
		{
			headers: { Authorization: `Bearer ${API_TOKEN}` },
		},
	);
	return res.json() as Promise<Entry>;
}

async function main() {
	const firstArg = process.argv[2];
	const secondArg = process.argv[3];
	if (!firstArg) {
		console.error(
			"Usage: node get-data.js <first_last | 'First Last'>",
		);
		process.exit(1);
	}
	const nameArg = secondArg ? `${firstArg} ${secondArg}` : firstArg;
	const normalized = nameArg
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
	let keys = await withRetry(() => fetchAllKeys(normalized + "_"));
	keys = keys.filter(k => k.startsWith(normalized + "_"));
	if (keys.length === 0) {
		console.log(`No entries found for name: ${nameArg}`);
		return;
	}
	console.log(`Found ${keys.length} entries for name: ${nameArg}`);
	for (const key of keys) {
		try {
			const entry = await withRetry(() => fetchEntry(key));
			console.log(`\n=== Entry for key: ${key} ===`);
			console.log(JSON.stringify(entry, null, 2));
		} catch (err) {
			console.error(`❌ Failed to fetch entry for ${key}`, err);
		}
	}
}

main().catch(err => {
	console.error("Fatal error:", err);
	process.exit(1);
});
