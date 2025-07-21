export interface Env {
	_101WEEK_CONTRACTS_KV: KVNamespace;
	R2: R2Bucket;
}

import type { Submission, LookupResult } from "../src/types";

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

const handleFormPost = async (request: Request, env: Env) => {
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
		const kvKey = `${firstName}_${lastName}_${timestamp}`;
		const emailIndexKey = `email_${email}_${timestamp}`;
		await env._101WEEK_CONTRACTS_KV.put(emailIndexKey, kvKey);

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
		let results: LookupResult[] = [];
		if (emailRegex.test(input)) {
			const normalized = sanitize(input);
			const listResponse = await env._101WEEK_CONTRACTS_KV.list({
				prefix: `email_${normalized}_`,
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
			const normalized = `${firstName}_${lastName}_`;
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

		// Robust migration endpoint: /migrate-keys?mode=dry-run|commit|delete
		if (url.pathname === "/migrate-keys" && request.method === "POST") {
			try {
				const mode = url.searchParams.get("mode") || "dry-run"; // dry-run (default), commit, delete
				const migrated: Array<{
					oldKey: string;
					newKey: string;
					emailIndexKey: string;
					copiedR2?: string[];
					updatedSignaturePaths?: Record<string, string | null>;
					deleted?: boolean;
					deletedR2?: string[];
				}> = [];
				const skipped: Array<{ oldKey: string; reason: string }> = [];
				let totalScanned = 0;
				let cursor: string | undefined = undefined;
				const logs: string[] = [];
				const keyRegex =
					/^([a-z0-9]+)_([a-z0-9]+)_([a-z0-9_]+)_(\d{13})$/i;
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
					for (const { name: oldKey } of listResp.keys) {
						totalScanned++;
						const match = oldKey.match(keyRegex);
						if (!match) {
							logs.push(
								`Skipped key ${oldKey}: does not match migration pattern`,
							);
							continue;
						}
						logs.push(`Matches: ${match.map(m => m).join(", ")}`);
						const [, firstName, lastName, email, timestamp] = match;
						const newKey = `${firstName}_${lastName}_${timestamp}`;
						const emailIndexKey = `email_${email}_${timestamp}`;
						let exists: string | null = null;
						try {
							exists = await env._101WEEK_CONTRACTS_KV.get(
								newKey,
							);
							if (exists)
								logs.push(
									`New key already exists for ${oldKey} -> ${newKey}`,
								);
						} catch (err) {
							logs.push(
								`Error checking existence of newKey ${newKey}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
						}
						if (!exists && mode === "delete") {
							skipped.push({
								oldKey,
								reason: "no new key for deletion",
							});
							logs.push(
								`Skipped deletion for ${oldKey}: no new key exists`,
							);
							continue;
						}
						let value: string | null = null;
						try {
							value = await env._101WEEK_CONTRACTS_KV.get(oldKey);
						} catch (err) {
							logs.push(
								`Error fetching oldKey ${oldKey}: ${
									err instanceof Error
										? err.message
										: String(err)
								}`,
							);
						}
						if (!value) {
							skipped.push({
								oldKey,
								reason: "old key missing value",
							});
							logs.push(`Skipped ${oldKey}: missing value`);
							continue;
						}
						let parsed: unknown;
						try {
							parsed = JSON.parse(value);
						} catch (err) {
							skipped.push({
								oldKey,
								reason: "invalid JSON in value",
							});
							logs.push(
								`Skipped ${oldKey}: invalid JSON (${
									err instanceof Error
										? err.message
										: String(err)
								})`,
							);
							continue;
						}
						type ParsedWithSignatures = {
							signaturePaths?: Record<string, string | null>;
							[key: string]: unknown;
						};
						const parsedObj = parsed as ParsedWithSignatures;
						if (mode === "delete") {
							const deletedR2: string[] = [];
							for (const field of [
								"signatureParticipant",
								"signatureParent",
							]) {
								const oldPath =
									parsedObj?.signaturePaths?.[field];
								if (
									typeof oldPath === "string" &&
									oldPath.startsWith(oldKey)
								) {
									try {
										await env.R2.delete(oldPath);
										deletedR2.push(oldPath);
										logs.push(
											`Deleted R2 object: ${oldPath}`,
										);
									} catch (err) {
										deletedR2.push(
											`${oldPath} (delete error)`,
										);
										logs.push(
											`Failed to delete R2 object: ${oldPath} (${
												err instanceof Error
													? err.message
													: String(err)
											})`,
										);
									}
								}
							}
							try {
								await env._101WEEK_CONTRACTS_KV.delete(oldKey);
								logs.push(`Deleted oldKey: ${oldKey}`);
							} catch (err) {
								logs.push(
									`Failed to delete oldKey: ${oldKey} (${
										err instanceof Error
											? err.message
											: String(err)
									})`,
								);
							}
							migrated.push({
								oldKey,
								newKey,
								emailIndexKey,
								deleted: true,
								deletedR2,
							});
							continue;
						}
						const copiedR2: string[] = [];
						const updatedSignaturePaths: Record<
							string,
							string | null
						> = {
							...((parsedObj && parsedObj.signaturePaths) || {}),
						};
						for (const field of [
							"signatureParticipant",
							"signatureParent",
						]) {
							const oldPath = parsedObj?.signaturePaths?.[field];
							if (
								typeof oldPath === "string" &&
								oldPath.startsWith(oldKey)
							) {
								const ext = oldPath.endsWith(".png")
									? ".png"
									: "";
								const newPath = `${newKey}${
									field === "signatureParticipant"
										? "_participant"
										: "_parent"
								}${ext}`;
								try {
									const obj = await env.R2.get(oldPath);
									if (obj) {
										if (mode === "commit") {
											await env.R2.put(
												newPath,
												await obj.arrayBuffer(),
											);
											logs.push(
												`Copied R2 object: ${oldPath} -> ${newPath}`,
											);
										}
										copiedR2.push(
											`${oldPath} -> ${newPath}`,
										);
										updatedSignaturePaths[field] = newPath;
									} else {
										copiedR2.push(`${oldPath} (not found)`);
										logs.push(
											`R2 object not found: ${oldPath}`,
										);
									}
								} catch (err) {
									copiedR2.push(`${oldPath} (copy error)`);
									logs.push(
										`Failed to copy R2 object: ${oldPath} (${
											err instanceof Error
												? err.message
												: String(err)
										})`,
									);
								}
							}
						}
						if (mode === "commit") {
							try {
								const newValue = JSON.stringify({
									...parsedObj,
									signaturePaths: updatedSignaturePaths,
								});
								await env._101WEEK_CONTRACTS_KV.put(
									newKey,
									newValue,
								);
								await env._101WEEK_CONTRACTS_KV.put(
									emailIndexKey,
									newKey,
								);
								logs.push(
									`Wrote new KV: ${newKey} and email index: ${emailIndexKey}`,
								);
							} catch (err) {
								skipped.push({
									oldKey,
									reason:
										"failed to write new KV: " +
										(err instanceof Error
											? err.message
											: String(err)),
								});
								logs.push(
									`Failed to write new KV for ${oldKey}: ${
										err instanceof Error
											? err.message
											: String(err)
									}`,
								);
								continue;
							}
						}
						migrated.push({
							oldKey,
							newKey,
							emailIndexKey,
							copiedR2,
							updatedSignaturePaths,
						});
					}
					if (!listResp.list_complete) {
						cursor = listResp.cursor;
					} else {
						break;
					}
				}
				const skipReasons: Record<string, number> = {};
				for (const s of skipped) {
					skipReasons[s.reason] = (skipReasons[s.reason] || 0) + 1;
				}
				logs.push(
					`Migration complete. Mode: ${mode}, Total scanned: ${totalScanned}, Migrated: ${migrated.length}, Skipped: ${skipped.length}`,
				);
				return new Response(
					JSON.stringify({
						mode,
						totalScanned,
						migrated,
						skipped,
						totalMigrated: migrated.length,
						totalSkipped: skipped.length,
						skipReasons,
						logs,
					}),
					{ headers: { "Content-Type": "application/json" } },
				);
			} catch (err) {
				console.error("/migrate-keys error", err);
				return new Response("Migration failed", { status: 500 });
			}
		}
		return new Response("Method Not Allowed", { status: 405 });
	},
} satisfies ExportedHandler<Env>;
