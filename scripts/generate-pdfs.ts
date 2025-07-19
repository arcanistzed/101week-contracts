import dotenv from "dotenv";
import process from "process";
import fs from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import { PDFDocument } from "pdf-lib";

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

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const R2_BASE_URL = process.env.R2_BASE_URL;
const OUTPUT_DIR = "./output";

if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN || !R2_BASE_URL) {
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
	let url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys`;
	if (prefix) {
		url += `?prefix=${encodeURIComponent(prefix)}`;
	}
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
	});
	const json = (await res.json()) as CloudflareKeysResponse;
	return json.result.map(k => k.name);
}

async function fetchEntry(key: string): Promise<Entry> {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`,
		{
			headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
		},
	);
	return res.json() as Promise<Entry>;
}

async function fetchSignatureImage(
	path: string | undefined | null,
): Promise<Uint8Array | null> {
	if (!path) return null;
	const res = await fetch(`${R2_BASE_URL}/${path}`);
	if (!res.ok) return null;
	return new Uint8Array(await res.arrayBuffer());
}

async function fillPdf(
	entry: Entry,
	sig1: Uint8Array | null,
	sig2: Uint8Array | null,
	outputPath: string,
) {
	const pdfBytes = await fs.readFile(
		`../public/101er Contract 2025 ${entry.preferredLanguage}.pdf`,
	);
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const form = pdfDoc.getForm();

	const missingFields: string[] = [];
	const setField = (name: string, value?: string) => {
		if (!value) return;
		try {
			const field = form.getTextField(name);
			field.setText(value);
		} catch {
			missingFields.push(name);
		}
	};

	setField("firstName", entry.firstName);
	setField("lastName", entry.lastName);
	setField("email", entry.email);
	setField("phone", entry.phone);
	setField("languages", entry.languages);
	setField("program", entry.program);
	setField("rsg1", entry.rsg1);
	setField("rsg2", entry.rsg2);
	setField("dob", entry.dob);
	setField("pronouns", entry.pronouns);
	setField("emergencyName", entry.emergencyName);
	setField("emergencyPhone", entry.emergencyPhone);
	setField("emergencyRelationship", entry.emergencyRelationship);
	setField("medical", entry.medical);
	setField("accessibility", entry.accessibility);
	setField("fullNameParticipant", entry.fullNameParticipant);
	setField("dateParticipant", entry.dateParticipant);
	setField("fullNameParent", entry.fullNameParent);
	setField("dateParent", entry.dateParent);

	if (missingFields.length > 0) {
		throw new Error(`Missing PDF fields: ${missingFields.join(", ")}`);
	}

	const page = pdfDoc.getPages()[0];

	if (sig1) {
		const img = await pdfDoc.embedPng(sig1);
		page.drawImage(img, {
			x: 100,
			y: 520,
			width: 150,
			height: 50,
		});
	}

	if (sig2) {
		const img = await pdfDoc.embedPng(sig2);
		page.drawImage(img, {
			x: 100,
			y: 450,
			width: 150,
			height: 50,
		});
	}

	form.flatten();
	const finalPdf = await pdfDoc.save();
	await fs.writeFile(outputPath, finalPdf);
}

async function main() {
	await fs.mkdir(OUTPUT_DIR, { recursive: true });

	// Accept name as argument: node generate-pdfs.js first_last
	const nameArg = process.argv[2];
	let keys: string[];
	if (nameArg) {
		// Accept either "first_last" or "First Last"
		const normalized = nameArg
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "_")
			.replace(/_+/g, "_")
			.replace(/^_+|_+$/g, "");
		keys = await withRetry(() => fetchAllKeys(normalized + "_"));
		// Further filter in case of partial matches
		keys = keys.filter(k => k.startsWith(normalized + "_"));
		if (keys.length === 0) {
			console.log(`No entries found for name: ${nameArg}`);
			return;
		}
		console.log(`Found ${keys.length} entries for name: ${nameArg}`);
	} else {
		keys = await withRetry(() => fetchAllKeys());
	}

	let successCount = 0,
		failureCount = 0;

	for (const key of keys) {
		const outputPath = path.join(OUTPUT_DIR, `${key}.pdf`);
		// Prevent accidental overwrite
		if (await fs.stat(outputPath).catch(() => false)) {
			console.log(`⏭ Skipping ${key}, already exists`);
			continue;
		}
		try {
			const entry = await withRetry(() => fetchEntry(key));
			const sig1 = await withRetry(() =>
				fetchSignatureImage(entry.signaturePaths?.signatureParticipant),
			);
			const sig2 = await withRetry(() =>
				fetchSignatureImage(entry.signaturePaths?.signatureParent),
			);
			await fillPdf(entry, sig1, sig2, outputPath);
			console.log(`✅ Generated PDF for ${key}`);
			successCount++;
		} catch (err) {
			console.error(`❌ Failed to process ${key}`, err);
			failureCount++;
			await fs.appendFile(
				"errors.log",
				`${new Date().toISOString()} ${key}: ${
					err instanceof Error ? err.stack || err.message : err
				}\n`,
			);
		}
	}
	console.log(`✅ Done. ${successCount} succeeded, ${failureCount} failed.`);
}

main().catch(err => {
	console.error("Fatal error:", err);
	process.exit(1);
});
