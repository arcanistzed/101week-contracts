export interface Env {
	_101WEEK_CONTRACTS_KV: KVNamespace;
	R2: R2Bucket;
}

import type { Submission, LookupResult } from "../src/types";

const REQUIRE_PARTICIPANT_SIGNATURE_FOR_MINORS = true;
const ALLOWED_IMAGE_PREFIXES = [
	"data:image/png;base64,",
	"data:image/jpeg;base64,",
];
const RSG_OPT_IN = ["ESS"];

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

const sanitize = (str: string) =>
	str
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "_");

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
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		let results: LookupResult[] = [];
		if (emailRegex.test(input)) {
			const normalized = sanitize(input);
			const listResponse = await env._101WEEK_CONTRACTS_KV.list({
				prefix: `${rsg}_email_${normalized}_`,
			});
			// Each value is a main record key
			const mainKeys = await Promise.all(
				listResponse.keys.map(async keyObj => {
					return await env._101WEEK_CONTRACTS_KV.get(keyObj.name);
				}),
			);
			// Clean up orphaned index keys if main record is missing
			const validMainKeys: string[] = [];
			await Promise.all(
				mainKeys.map(async (mainKey, idx) => {
					if (!mainKey) return;
					const value = await env._101WEEK_CONTRACTS_KV.get(mainKey);
					if (!value) {
						try {
							await env._101WEEK_CONTRACTS_KV.delete(
								listResponse.keys[idx].name,
							);
						} catch (err) {
							console.error(
								"Failed to delete orphaned email index key",
								listResponse.keys[idx].name,
								err,
							);
						}
					} else {
						validMainKeys.push(mainKey);
					}
				}),
			);
			results = await fetchValidRecords(validMainKeys, env);
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
			const firstName = sanitize(parts[0]);
			const lastName = sanitize(parts[1]);
			const normalized = `${rsg}_${firstName}_${lastName}_`;
			const listResponse = await env._101WEEK_CONTRACTS_KV.list({
				prefix: normalized,
			});
			const keys = listResponse.keys.map(k => k.name);
			results = await fetchValidRecords(keys, env);
		}

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

		// Migration endpoint: /migrate-ess-prefix?mode=dry-run|commit
		if (
			url.pathname === "/migrate-ess-prefix" &&
			request.method === "POST"
		) {
			try {
				const mode = url.searchParams.get("mode") || "dry-run";
				let totalScanned = 0;
				let totalMigrated = 0;
				let totalSkipped = 0;
				let cursor: string | undefined = undefined;
				const logs: string[] = [];
				const migrated: Array<{
					oldKey: string;
					newKey: string;
					updatedFields: string[];
					r2Paths: string[];
				}> = [];
				const skipped: Array<{ key: string; reason: string }> = [];
				while (true) {
					let listResp: {
						keys: { name: string }[];
						list_complete: boolean;
						cursor?: string;
					};
					try {
						listResp = await env._101WEEK_CONTRACTS_KV.list({
							cursor,
							limit: 1000,
						});
						logs.push(
							`Listed KV keys batch (cursor=${
								cursor ?? "start"
							}), found ${listResp.keys.length}`,
						);
					} catch (err) {
						const msg =
							"KV list error: " +
							(err instanceof Error ? err.message : String(err));
						logs.push(msg);
						return new Response(msg, { status: 500 });
					}
					for (const { name: key } of listResp.keys) {
						totalScanned++;
						if (
							key.startsWith("ESS_") ||
							((key.startsWith("email_") ||
								key.includes("_email_")) &&
								key.startsWith("ESS_"))
						) {
							logs.push(`Skipped already-prefixed key: ${key}`);
							totalSkipped++;
							skipped.push({ key, reason: "already prefixed" });
							continue;
						}
						if (
							key.startsWith("email_") ||
							key.includes("_email_")
						) {
							let indexValue: string | null = null;
							try {
								indexValue =
									await env._101WEEK_CONTRACTS_KV.get(key);
							} catch (err) {
								logs.push(
									`Error fetching index key ${key}: ${
										err instanceof Error
											? err.message
											: String(err)
									}`,
								);
							}
							if (!indexValue) {
								logs.push(
									`Index key ${key} missing value in KV`,
								);
								totalSkipped++;
								skipped.push({ key, reason: "missing value" });
								continue;
							}
							let indexNewKey = key;
							if (!key.startsWith("ESS_")) {
								indexNewKey = `ESS_${key}`;
							}
							if (mode === "commit") {
								try {
									await env._101WEEK_CONTRACTS_KV.put(
										indexNewKey,
										indexValue,
									);
									logs.push(
										`Created new index KV key: ${indexNewKey}`,
									);
									await env._101WEEK_CONTRACTS_KV.delete(key);
									logs.push(
										`Deleted old index KV key: ${key}`,
									);
								} catch (err) {
									logs.push(
										`Error writing new index KV key ${indexNewKey}: ${
											err instanceof Error
												? err.message
												: String(err)
										}`,
									);
								}
							} else {
								logs.push(
									`[dry-run] Would create new index KV key: ${indexNewKey} and delete old index KV key: ${key}`,
								);
							}
							totalMigrated++;
							migrated.push({
								oldKey: key,
								newKey: indexNewKey,
								updatedFields: [],
								r2Paths: [],
							});
							continue;
						}
						let mainValue: string | null = null;
						try {
							mainValue = await env._101WEEK_CONTRACTS_KV.get(
								key,
							);
						} catch (err) {
							logs.push(
								`Error fetching key ${key}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
						}
						if (!mainValue) {
							logs.push(`Key ${key} missing value in KV`);
							totalSkipped++;
							skipped.push({ key, reason: "missing value" });
							continue;
						}
						let mainParsed: Partial<Submission> &
							Record<string, unknown>;
						try {
							mainParsed = JSON.parse(mainValue);
						} catch (err) {
							logs.push(
								`Invalid JSON for key ${key}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "invalid JSON" });
							continue;
						}
						if (!isValidLookupData(mainParsed)) {
							logs.push(
								`Invalid data shape for key ${key}: ${JSON.stringify(
									mainParsed,
								)}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "invalid data shape" });
							continue;
						}
						if (!mainParsed || typeof mainParsed !== "object") {
							logs.push(
								`Parsed value for key ${key} is not an object: ${JSON.stringify(
									mainParsed,
								)}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "not an object" });
							continue;
						}
						if (!mainParsed.signaturePaths)
							mainParsed.signaturePaths = {};
						// Update rsg1 field
						mainParsed.rsg1 = "ESS";
						// Build new key by prefixing ESS_
						let mainNewKey = key;
						if (!key.startsWith("ESS_")) {
							mainNewKey = `ESS_${key}`;
						}
						// Update R2 paths by prefixing ESS/
						const mainUpdatedFields: string[] = [];
						const mainR2Paths: string[] = [];
						for (const field of [
							"signatureParticipant",
							"signatureParent",
						] as const) {
							const oldPath = mainParsed.signaturePaths[field];
							if (typeof oldPath === "string") {
								if (oldPath.startsWith("ESS/")) {
									// Already prefixed, skip
									continue;
								}
								const newPath = `ESS/${oldPath}`;
								if (mode === "commit") {
									try {
										const obj = await env.R2.get(oldPath);
										if (obj) {
											await env.R2.put(
												newPath,
												await obj.arrayBuffer(),
											);
											await env.R2.delete(oldPath);
											logs.push(
												`Moved R2 image from ${oldPath} to ${newPath}`,
											);
											mainParsed.signaturePaths[field] =
												newPath;
											mainUpdatedFields.push(field);
											mainR2Paths.push(newPath);
										} else {
											logs.push(
												`R2 image not found: ${oldPath}`,
											);
										}
									} catch (err) {
										logs.push(
											`Error moving R2 image ${oldPath}: ${
												err instanceof Error
													? err.message
													: String(err)
											}`,
										);
									}
								} else {
									logs.push(
										`[dry-run] Would move R2 image from ${oldPath} to ${newPath}`,
									);
									mainUpdatedFields.push(field);
									mainR2Paths.push(newPath);
								}
							}
						}
						// Write new KV key
						if (mode === "commit") {
							try {
								await env._101WEEK_CONTRACTS_KV.put(
									mainNewKey,
									JSON.stringify(mainParsed),
								);
								logs.push(`Created new KV key: ${mainNewKey}`);
								await env._101WEEK_CONTRACTS_KV.delete(key);
								logs.push(`Deleted old KV key: ${key}`);
							} catch (err) {
								logs.push(
									`Error writing new KV key ${mainNewKey}: ${
										err instanceof Error
											? err.message
											: String(err)
									}`,
								);
							}
						} else {
							logs.push(
								`[dry-run] Would create new KV key: ${mainNewKey} and delete old KV key: ${key}`,
							);
						}
						totalMigrated++;
						migrated.push({
							oldKey: key,
							newKey: mainNewKey,
							updatedFields: mainUpdatedFields,
							r2Paths: mainR2Paths,
						});
						let value: string | null = null;
						try {
							value = await env._101WEEK_CONTRACTS_KV.get(key);
						} catch (err) {
							logs.push(
								`Error fetching key ${key}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
						}
						if (!value) {
							logs.push(`Key ${key} missing value in KV`);
							totalSkipped++;
							skipped.push({ key, reason: "missing value" });
							continue;
						}
						let parsed: Partial<Submission> &
							Record<string, unknown>;
						try {
							parsed = JSON.parse(value);
						} catch (err) {
							logs.push(
								`Invalid JSON for key ${key}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "invalid JSON" });
							continue;
						}
						if (!isValidLookupData(parsed)) {
							logs.push(
								`Invalid data shape for key ${key}: ${JSON.stringify(
									parsed,
								)}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "invalid data shape" });
							continue;
						}
						if (!parsed || typeof parsed !== "object") {
							logs.push(
								`Parsed value for key ${key} is not an object: ${JSON.stringify(
									parsed,
								)}`,
							);
							totalSkipped++;
							skipped.push({ key, reason: "not an object" });
							continue;
						}
						if (!parsed.signaturePaths) parsed.signaturePaths = {};
						// Update rsg1 field
						parsed.rsg1 = "ESS";
						// Build new key by prefixing ESS_
						let newKey = key;
						if (!key.startsWith("ESS_")) {
							newKey = `ESS_${key}`;
						}
						// Update R2 paths by prefixing ESS/
						const updatedFields: string[] = [];
						const r2Paths: string[] = [];
						for (const field of [
							"signatureParticipant",
							"signatureParent",
						] as const) {
							const oldPath = parsed.signaturePaths[field];
							if (
								typeof oldPath === "string" &&
								!oldPath.startsWith("ESS/")
							) {
								const newPath = `ESS/${oldPath}`;
								if (mode === "commit") {
									try {
										const obj = await env.R2.get(oldPath);
										if (obj) {
											await env.R2.put(
												newPath,
												await obj.arrayBuffer(),
											);
											await env.R2.delete(oldPath);
											logs.push(
												`Moved R2 image from ${oldPath} to ${newPath}`,
											);
											parsed.signaturePaths[field] =
												newPath;
											updatedFields.push(field);
											r2Paths.push(newPath);
										} else {
											logs.push(
												`R2 image not found: ${oldPath}`,
											);
										}
									} catch (err) {
										logs.push(
											`Error moving R2 image ${oldPath}: ${
												err instanceof Error
													? err.message
													: String(err)
											}`,
										);
									}
								} else {
									logs.push(
										`[dry-run] Would move R2 image from ${oldPath} to ${newPath}`,
									);
									updatedFields.push(field);
									r2Paths.push(newPath);
								}
							}
						}
						// Write new KV key
						if (mode === "commit") {
							try {
								await env._101WEEK_CONTRACTS_KV.put(
									newKey,
									JSON.stringify(parsed),
								);
								logs.push(`Created new KV key: ${newKey}`);
								await env._101WEEK_CONTRACTS_KV.delete(key);
								logs.push(`Deleted old KV key: ${key}`);
							} catch (err) {
								logs.push(
									`Error writing new KV key ${newKey}: ${
										err instanceof Error
											? err.message
											: String(err)
									}`,
								);
							}
						} else {
							logs.push(
								`[dry-run] Would create new KV key: ${newKey} and delete old KV key: ${key}`,
							);
						}
						totalMigrated++;
						migrated.push({
							oldKey: key,
							newKey,
							updatedFields,
							r2Paths,
						});
					}
					if (!listResp.list_complete) {
						cursor = listResp.cursor;
					} else {
						break;
					}
				}
				logs.push(
					`Migration complete. Mode: ${mode}, Total scanned: ${totalScanned}, Migrated: ${totalMigrated}, Skipped: ${totalSkipped}`,
				);
				return new Response(
					JSON.stringify({
						mode,
						totalScanned,
						totalMigrated,
						totalSkipped,
						migrated,
						skipped,
						logs,
					}),
					{ headers: { "Content-Type": "application/json" } },
				);
			} catch (err) {
				console.error("/migrate-ess-prefix error", err);
				return new Response("Migration failed", { status: 500 });
			}
		}

		return new Response("Method Not Allowed", { status: 405 });
	},
} satisfies ExportedHandler<Env>;
