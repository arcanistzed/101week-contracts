export interface Env {
	_101WEEK_CONTRACTS_KV: KVNamespace;
	R2: R2Bucket;
}

import type { LookupResult, Submission } from "../src/types";

const REQUIRE_PARTICIPANT_SIGNATURE_FOR_MINORS = true;
const ALLOWED_IMAGE_PREFIXES = [
	"data:image/png;base64,",
	"data:image/jpeg;base64,",
];
const RSG_OPT_IN = ["ESS", "SAFA"];

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
] as const;

// Helper to sanitize input strings
const sanitize = (str: string) =>
	str
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "_");

// Helper to validate lookup data
const isValidLookupData = (data: unknown): data is Submission => {
	if (!data || typeof data !== "object" || Array.isArray(data)) return false;
	return requiredFields.every(field => field in data);
};

// Helper to fetch and validate records by keys
const fetchValidRecords = async (
	keys: string[],
	env: Env,
): Promise<LookupResult[]> => {
	const results = await Promise.all(
		keys.slice(0, MAX_RESULTS).map(async key => {
			const value = await env._101WEEK_CONTRACTS_KV.get(key);
			if (value) {
				try {
					const data = JSON.parse(value);
					if (isValidLookupData(data)) {
						return { key, data };
					} else {
						console.error("Invalid data shape for key", key, data);
						return null;
					}
				} catch (err) {
					console.error("Failed to parse JSON for key", key, err);
					return null;
				}
			}
			return null;
		}),
	);
	return results.filter((r): r is LookupResult => r !== null);
};

// Helper to build the prefix for lookup based on input and rsg
const buildLookupPrefix = (
	input: string,
	rsg: string,
): { prefix: string; isEmail: boolean } | { error: string } => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const trimmedInput: string = input.trim();
	const parts: string[] = trimmedInput.split(/\s+/);
	if (emailRegex.test(trimmedInput)) {
		const normalizedEmail: string = trimmedInput.toLowerCase();
		return {
			prefix: `${rsg}_email_${sanitize(normalizedEmail)}_`,
			isEmail: true,
		};
	} else if (parts.length === 1) {
		return { prefix: `${rsg}_${sanitize(parts[0])}_`, isEmail: false };
	} else if (parts.length === 2) {
		return {
			prefix: `${rsg}_${sanitize(parts[0])}_${sanitize(parts[1])}_`,
			isEmail: false,
		};
	} else {
		return {
			error: "Input must be a valid email, first name, or full name.",
		};
	}
};

// Handle the form submission
export const handleFormPost = async (request: Request, env: Env) => {
	try {
		const submission = (await request.json()) as Submission;

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
		if (isAdult || (!isAdult && REQUIRE_PARTICIPANT_SIGNATURE_FOR_MINORS)) {
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
		const rsg = submission.rsg1;
		if (!rsg || !RSG_OPT_IN.includes(rsg)) {
			return new Response("Invalid or not opted-in RSG", {
				status: 400,
			});
		}
		const firstName = sanitize(submission.firstName);
		const lastName = sanitize(submission.lastName);
		const email = sanitize(submission.email);
		const timestamp = Date.now();
		const kvKey = `${rsg}_${firstName}_${lastName}_${timestamp}`;
		const emailIndexKey = `${rsg}_email_${email}_${timestamp}`;
		await env._101WEEK_CONTRACTS_KV.put(emailIndexKey, kvKey);

		// Save original base64 images for R2 upload, but only store R2 path in KV if image
		const signaturePaths: Record<string, string | null> = {};
		const originalSignatureParticipant = submission.signatureParticipant;
		const originalSignatureParent = submission.signatureParent;

		// Validate allowed image types for signatures
		if (
			originalSignatureParticipant &&
			typeof originalSignatureParticipant === "string" &&
			originalSignatureParticipant.startsWith("data:image/")
		) {
			const allowed = ALLOWED_IMAGE_PREFIXES.some(prefix =>
				originalSignatureParticipant.startsWith(prefix),
			);
			if (!allowed) {
				return new Response(
					"Participant signature must be PNG or JPEG",
					{ status: 400 },
				);
			}
		}
		if (
			originalSignatureParent &&
			typeof originalSignatureParent === "string" &&
			originalSignatureParent.startsWith("data:image/")
		) {
			const allowed = ALLOWED_IMAGE_PREFIXES.some(prefix =>
				originalSignatureParent.startsWith(prefix),
			);
			if (!allowed) {
				return new Response("Parent signature must be PNG or JPEG", {
					status: 400,
				});
			}
		}

		if (
			originalSignatureParticipant &&
			typeof originalSignatureParticipant === "string" &&
			ALLOWED_IMAGE_PREFIXES.some(prefix =>
				originalSignatureParticipant.startsWith(prefix),
			)
		) {
			const ext = originalSignatureParticipant.startsWith(
				"data:image/png",
			)
				? "png"
				: "jpeg";
			signaturePaths.signatureParticipant = `${rsg}/${firstName}_${lastName}_${timestamp}_participant.${ext}`;
			delete submission.signatureParticipant;
		} else {
			signaturePaths.signatureParticipant = null;
		}
		if (
			originalSignatureParent &&
			typeof originalSignatureParent === "string" &&
			ALLOWED_IMAGE_PREFIXES.some(prefix =>
				originalSignatureParent.startsWith(prefix),
			)
		) {
			const ext = originalSignatureParent.startsWith("data:image/png")
				? "png"
				: "jpeg";
			signaturePaths.signatureParent = `${rsg}/${firstName}_${lastName}_${timestamp}_parent.${ext}`;
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
			const prefix = ALLOWED_IMAGE_PREFIXES.find(prefix =>
				originalSignatureParticipant.startsWith(prefix),
			);
			if (prefix) {
				const base64Data = originalSignatureParticipant.replace(
					prefix,
					"",
				);
				if ((base64Data.length * 3) / 4 > MAX_IMAGE_SIZE) {
					return new Response(
						"Participant signature image too large",
						{
							status: 400,
						},
					);
				}
				const binary = Uint8Array.from(atob(base64Data), c =>
					c.charCodeAt(0),
				);
				await env.R2.put(signaturePaths.signatureParticipant, binary);
			}
		}
		if (
			signaturePaths.signatureParent &&
			typeof originalSignatureParent === "string"
		) {
			const prefix = ALLOWED_IMAGE_PREFIXES.find(prefix =>
				originalSignatureParent.startsWith(prefix),
			);
			if (prefix) {
				const base64Data = originalSignatureParent.replace(prefix, "");
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

// Handle the lookup request
const handleLookup = async (request: Request, env: Env) => {
	try {
		const url = new URL(request.url);
		const input = url.searchParams.get("input");
		const rsg = url.searchParams.get("rsg");

		if (!input || !rsg) {
			return new Response("Missing 'rsg' or 'input' query parameter", {
				status: 400,
			});
		}

		const prefixResult = buildLookupPrefix(input, rsg);
		if ("error" in prefixResult) {
			return new Response(prefixResult.error, { status: 400 });
		}
		const { prefix, isEmail } = prefixResult;

		const listResponse = await env._101WEEK_CONTRACTS_KV.list({
			prefix,
		});
		if (isEmail) {
			const mainKeys = await Promise.all(
				listResponse.keys.map(keyObj =>
					env._101WEEK_CONTRACTS_KV.get(keyObj.name),
				),
			);
			const filteredMainKeys = mainKeys.filter(
				(k): k is string => typeof k === "string",
			);
			return new Response(
				JSON.stringify(await fetchValidRecords(filteredMainKeys, env)),
				{ headers: { "Content-Type": "application/json" } },
			);
		} else {
			const keys = listResponse.keys.map(k => k.name);
			return new Response(
				JSON.stringify(await fetchValidRecords(keys, env)),
				{ headers: { "Content-Type": "application/json" } },
			);
		}
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
