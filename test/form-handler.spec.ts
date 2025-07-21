import { describe, expect, it } from "vitest";
import { Env } from "../worker/index";
import { handleFormPost } from "../worker/index";

function makeMockEnv(): Env {
	return {
		_101WEEK_CONTRACTS_KV: {
			put: async () => undefined,
			get: async () => null,
			delete: async () => undefined,
		},
		R2: {
			put: async () => undefined,
			get: async () => null,
			delete: async () => undefined,
		},
	};
}

async function runFunction(request: Request, env: Env) {
	return await handleFormPost(request, env);
}

describe("Form submission worker", () => {
	const validBase64 =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgMBApUAAAAASUVORK5CYII="; // short, valid png
	const bigBase64 = "A".repeat(1024 * 1024 * 2); // 2MB

	type Submission = {
		preferredLanguage: string;
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		languages: string;
		program: string;
		rsg1: string;
		emergencyName: string;
		emergencyPhone: string;
		signatureParticipant?: string;
		fullNameParticipant?: string;
		dob: string;
		fullNameParent?: string;
		signatureParent?: string;
	};
	const validSubmission: Submission = {
		preferredLanguage: "en",
		firstName: "John",
		lastName: "Doe",
		email: "john@example.com",
		phone: "1234567890",
		languages: "English",
		program: "Engineering",
		rsg1: "Yes",
		emergencyName: "Jane",
		emergencyPhone: "0987654321",
		signatureParticipant: `data:image/png;base64,${validBase64}`,
		fullNameParticipant: "John Doe",
		dob: "2000-01-01",
	};

	it("rejects missing required fields", async () => {
		const partial = { ...validSubmission };
		delete partial.signatureParticipant;
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(partial),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(
			/Missing required field: (signatureParticipant|fullNameParticipant)/.test(
				text,
			),
		).toBe(true);
	});

	it("rejects invalid email", async () => {
		const bad = { ...validSubmission, email: "notanemail" };
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(bad),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Invalid email format/);
	});

	it("rejects future date of birth", async () => {
		const future = { ...validSubmission, dob: "2999-01-01" };
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(future),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Date of birth cannot be in the future/);
	});

	it("requires parent fields for minors", async () => {
		const minor = { ...validSubmission, dob: "2015-01-01" };
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(minor),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Missing required field: fullNameParent/);
	});

	it("rejects oversized participant signature", async () => {
		const big = {
			...validSubmission,
			fullNameParticipant: "John Doe",
			signatureParticipant: `data:image/png;base64,${bigBase64}`,
		};
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(big),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Participant signature image too large/);
	});

	it("accepts valid adult submission", async () => {
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(validSubmission),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
		expect(json.id).toBeDefined();
	});

	it("accepts valid minor submission with parent fields", async () => {
		const minor = {
			...validSubmission,
			dob: "2015-01-01",
			fullNameParent: "Parent Name",
			signatureParent: `data:image/png;base64,${validBase64}`,
		};
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(minor),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
		expect(json.id).toBeDefined();
	});

	it("rejects whitespace-only required fields", async () => {
		const bad = { ...validSubmission, firstName: "   " };
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(bad),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Missing required field: firstName/);
	});

	it("accepts empty optional fields for adults", async () => {
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify({
				...validSubmission,
				fullNameParent: "",
				signatureParent: "",
			}),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
	});

	it("accepts text signatureParticipant", async () => {
		const textSig = {
			...validSubmission,
			signatureParticipant: "John Doe",
		};
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(textSig),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
	});

	it("rejects invalid base64 with PNG prefix", async () => {
		const bad = {
			...validSubmission,
			signatureParticipant: "data:image/png;base64,not-valid-base64",
		};
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(bad),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Bad Request/);
	});

	it("rejects oversized parent signature for minors", async () => {
		const minor = {
			...validSubmission,
			dob: "2015-01-01",
			fullNameParent: "Parent Name",
			signatureParent: `data:image/png;base64,${bigBase64}`,
		};
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(minor),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Parent signature image too large/);
	});

	it("accepts non-PNG signature (jpeg)", async () => {
		const jpegBase64 = validBase64; // still valid base64, just a different prefix
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify({
				...validSubmission,
				signatureParticipant: `data:image/jpeg;base64,${jpegBase64}`,
			}),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
	});

	it("accepts duplicate submission", async () => {
		const req1 = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(validSubmission),
		});
		const req2 = new Request("http://test", {
			method: "POST",
			body: JSON.stringify(validSubmission),
		});
		const res1 = await runFunction(req1, makeMockEnv());
		const res2 = await runFunction(req2, makeMockEnv());
		if (res1.status !== 200) {
			const text = await res1.text();
			console.error("Test failed:", text);
		}
		if (res2.status !== 200) {
			const text = await res2.text();
			console.error("Test failed:", text);
		}
		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
	});

	it("rejects malformed JSON", async () => {
		const req = new Request("http://test", {
			method: "POST",
			body: "{not valid json}",
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Bad Request/);
	});

	it("rejects missing body", async () => {
		const req = new Request("http://test", { method: "POST" });
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 400) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toMatch(/Bad Request/);
	});

	it("accepts extra fields in payload", async () => {
		const req = new Request("http://test", {
			method: "POST",
			body: JSON.stringify({ ...validSubmission, extraField: "extra" }),
		});
		const res = await runFunction(req, makeMockEnv());
		if (res.status !== 200) {
			const text = await res.text();
			console.error("Test failed:", text);
		}
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; id: string };
		expect(json.ok).toBe(true);
	});
});
