export interface Env {
	_101WEEK_CONTRACTS_KV: KVNamespace;
	R2: R2Bucket;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		try {
			const submission = (await request.json()) as Record<string, unknown>;

			// Validate required fields
			const requiredFields = [
				'firstName',
				'lastName',
				'email',
				'phone',
				'languages',
				'program',
				'rsg1',
				'emergencyName',
				'emergencyPhone',
				'signatureParticipant',
			];
			for (const field of requiredFields) {
				if (!submission[field] || (typeof submission[field] === 'string' && submission[field].toString().trim() === '')) {
					return new Response(`Missing required field: ${field}`, { status: 400 });
				}
			}
			// Validate email format
			if (typeof submission.email === 'string' && !/^\S+@\S+\.\S+$/.test(submission.email)) {
				return new Response('Invalid email format', { status: 400 });
			}
			// Validate future date of birth
			if (submission.dob && typeof submission.dob === 'string') {
				const todayStr = new Date().toISOString().slice(0, 10);
				if (submission.dob > todayStr) {
					return new Response('Date of birth cannot be in the future', { status: 400 });
				}
			}
			// If under 18, require parent fields
			let isAdult = true;
			if (submission.dob && typeof submission.dob === 'string') {
				const birthDate = new Date(submission.dob);
				const today = new Date();
				let age = today.getFullYear() - birthDate.getFullYear();
				const m = today.getMonth() - birthDate.getMonth();
				if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
					age--;
				}
				isAdult = age >= 18;
			}
			if (!isAdult) {
				const parentFields = ['fullNameParent', 'signatureParent'];
				for (const field of parentFields) {
					if (!submission[field] || (typeof submission[field] === 'string' && submission[field].toString().trim() === '')) {
						return new Response(`Missing required field: ${field}`, { status: 400 });
					}
				}
			}

			// Generate submission ID and timestamp
			const id = crypto.randomUUID();
			const timestamp = new Date().toISOString();
			const kvKey = `submission:${id}`;

			submission.submittedAt = timestamp;

			// Save original base64 images for R2 upload, but only store R2 path in KV if image
			const signaturePaths: Record<string, string | null> = {};
			const originalSignatureParticipant = submission.signatureParticipant;
			const originalSignatureParent = submission.signatureParent;

			if (
				originalSignatureParticipant &&
				typeof originalSignatureParticipant === 'string' &&
				originalSignatureParticipant.startsWith('data:image/png;base64,')
			) {
				signaturePaths.signatureParticipant = `${kvKey}-participant.png`;
				// Remove base64 image from KV, only store R2 path
				delete submission.signatureParticipant;
			} else {
				signaturePaths.signatureParticipant = null;
			}
			if (
				originalSignatureParent &&
				typeof originalSignatureParent === 'string' &&
				originalSignatureParent.startsWith('data:image/png;base64,')
			) {
				signaturePaths.signatureParent = `${kvKey}-parent.png`;
				delete submission.signatureParent;
			} else {
				signaturePaths.signatureParent = null;
			}
			submission.signaturePaths = signaturePaths;

			// Store the full submission in KV
			await env._101WEEK_CONTRACTS_KV.put(kvKey, JSON.stringify(submission));

			// Upload image signatures to R2 if present, with a size check
			const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
			if (signaturePaths.signatureParticipant && typeof originalSignatureParticipant === 'string') {
				const base64Data = originalSignatureParticipant.replace(/^data:image\/png;base64,/, '');
				if ((base64Data.length * 3) / 4 > MAX_IMAGE_SIZE) {
					return new Response('Participant signature image too large', { status: 400 });
				}
				const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
				await env.R2.put(signaturePaths.signatureParticipant, binary);
			}
			if (signaturePaths.signatureParent && typeof originalSignatureParent === 'string') {
				const base64Data = originalSignatureParent.replace(/^data:image\/png;base64,/, '');
				if ((base64Data.length * 3) / 4 > MAX_IMAGE_SIZE) {
					return new Response('Parent signature image too large', { status: 400 });
				}
				const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
				await env.R2.put(signaturePaths.signatureParent, binary);
			}

			return new Response(JSON.stringify({ ok: true, id }), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			return new Response('Bad Request: ' + message, { status: 400 });
		}
	},
};
