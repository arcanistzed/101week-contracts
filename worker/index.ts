export interface Env {
	_101WEEK_CONTRACTS_KV: KVNamespace;
	R2: R2Bucket;
}

import type { Submission, LookupResult } from "../src/types";

const sanitize = (str: string) =>
	str
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "_");

const handleFormPost = async (request: Request, env: Env) => {
	try {
		const submission = (await request.json()) as Submission;

		// Validate required fields
		const requiredFields: (keyof Submission)[] = [
			"preferredLanguage",
			"firstName",
			"lastName",
			"email",
			"phone",
			"languages",
			"program",
			"rsg1",
			"emergencyName",
			"emergencyPhone",
		];
		for (const field of requiredFields) {
			if (
				!submission[field] ||
				(typeof submission[field] === "string" &&
					submission[field].toString().trim() === "")
			) {
				return new Response(`Missing required field: ${field}`, {
					status: 400,
				});
			}
		}
		// Validate email format
		if (
			typeof submission.email === "string" &&
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)
		) {
			return new Response("Invalid email format", { status: 400 });
		}
		// Validate future date of birth
		if (submission.dob && typeof submission.dob === "string") {
			const todayStr = new Date().toISOString().slice(0, 10);
			if (submission.dob > todayStr) {
				return new Response("Date of birth cannot be in the future", {
					status: 400,
				});
			}
		}
		let isAdult = true;
		if (submission.dob && typeof submission.dob === "string") {
			const birthDate = new Date(submission.dob);
			const today = new Date();
			let age = today.getFullYear() - birthDate.getFullYear();
			const m = today.getMonth() - birthDate.getMonth();
			if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
				age--;
			}
			isAdult = age >= 18;
		}
		if (isAdult) {
			const participantFields: (keyof Submission)[] = [
				"fullNameParticipant",
				"signatureParticipant",
			];
			for (const field of participantFields) {
				if (
					!submission[field] ||
					(typeof submission[field] === "string" &&
						submission[field].toString().trim() === "")
				) {
					return new Response(`Missing required field: ${field}`, {
						status: 400,
					});
				}
			}
		} else {
			const parentFields: (keyof Submission)[] = [
				"fullNameParent",
				"signatureParent",
			];
			for (const field of parentFields) {
				if (
					!submission[field] ||
					(typeof submission[field] === "string" &&
						submission[field].toString().trim() === "")
				) {
					return new Response(`Missing required field: ${field}`, {
						status: 400,
					});
				}
			}
		}

		const firstName = sanitize(submission.firstName);
		const lastName = sanitize(submission.lastName);
		const email = sanitize(submission.email);
		const timestamp = Date.now();
		const kvKey = `${firstName}_${lastName}_${email}_${timestamp}`;

		// Save original base64 images for R2 upload, but only store R2 path in KV if image
		const signaturePaths: Record<string, string | null> = {};
		const originalSignatureParticipant = submission.signatureParticipant;
		const originalSignatureParent = submission.signatureParent;

		if (
			originalSignatureParticipant &&
			typeof originalSignatureParticipant === "string" &&
			originalSignatureParticipant.startsWith("data:image/png;base64,")
		) {
			signaturePaths.signatureParticipant = `${kvKey}_participant.png`;
			delete submission.signatureParticipant;
		} else {
			signaturePaths.signatureParticipant = null;
		}
		if (
			originalSignatureParent &&
			typeof originalSignatureParent === "string" &&
			originalSignatureParent.startsWith("data:image/png;base64,")
		) {
			signaturePaths.signatureParent = `${kvKey}_parent.png`;
			delete submission.signatureParent;
		} else {
			signaturePaths.signatureParent = null;
		}

		// Store the full submission in KV
		await env._101WEEK_CONTRACTS_KV.put(
			kvKey,
			JSON.stringify({
				...submission,
				signaturePaths,
			}),
		);

		// Upload image signatures to R2 if present, with a size check
		const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
		if (
			signaturePaths.signatureParticipant &&
			typeof originalSignatureParticipant === "string"
		) {
			const base64Data = originalSignatureParticipant.replace(
				/^data:image\/png;base64,/,
				"",
			);
			if ((base64Data.length * 3) / 4 > MAX_IMAGE_SIZE) {
				return new Response("Participant signature image too large", {
					status: 400,
				});
			}
			const binary = Uint8Array.from(atob(base64Data), c =>
				c.charCodeAt(0),
			);
			await env.R2.put(signaturePaths.signatureParticipant, binary);
		}
		if (
			signaturePaths.signatureParent &&
			typeof originalSignatureParent === "string"
		) {
			const base64Data = originalSignatureParent.replace(
				/^data:image\/png;base64,/,
				"",
			);
			if ((base64Data.length * 3) / 4 > MAX_IMAGE_SIZE) {
				return new Response("Parent signature image too large", {
					status: 400,
				});
			}
			const binary = Uint8Array.from(atob(base64Data), c =>
				c.charCodeAt(0),
			);
			await env.R2.put(signaturePaths.signatureParent, binary);
		}

		return new Response(JSON.stringify({ ok: true, id: kvKey }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response("Bad Request: " + message, { status: 400 });
	}
};



const MAX_RESULTS = 50;

const handleLookup = async (request: Request, env: Env) => {
	try {
		const url = new URL(request.url);
		const input = url.searchParams.get("input");
		if (!input) {
			return new Response("Missing 'input' query parameter", {
				status: 400,
			});
		}
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		let listResponse;
		if (emailRegex.test(input)) {
			const normalized = input
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "");
			listResponse = await env._101WEEK_CONTRACTS_KV.list({
				prefix: `_${normalized}_`,
			});
		} else {
			const parts = input.trim().split(/\s+/);
			if (parts.length !== 2) {
				return new Response(
					"Input must be a valid email or full name",
					{
						status: 400,
					},
				);
			}
			const firstName = parts[0]
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "");
			const lastName = parts[1]
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "");
			const normalized = `${firstName}_${lastName}_`;
			listResponse = await env._101WEEK_CONTRACTS_KV.list({
				prefix: normalized,
			});
		}

		const results: LookupResult[] = (
			await Promise.all(
				listResponse.keys.slice(0, MAX_RESULTS).map(async keyObj => {
					const value = await env._101WEEK_CONTRACTS_KV.get(
						keyObj.name,
					);
					if (value) {
						try {
							return {
								key: keyObj.name,
								data: JSON.parse(value),
							};
						} catch {
							return { key: keyObj.name, data: value };
						}
					}
					return null;
				}),
			)
		).filter(Boolean) as LookupResult[];

		return new Response(JSON.stringify(results), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("/lookup error", err);
		return new Response("Internal Server Error", { status: 500 });
	}
};

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);

		if (url.pathname === "/form-handler" && request.method === "POST") {
			return await handleFormPost(request, env);
		}
		if (url.pathname === "/lookup" && request.method === "GET") {
			return await handleLookup(request, env);
		}
		return new Response("Method Not Allowed", { status: 405 });
	},
} satisfies ExportedHandler<Env>;
