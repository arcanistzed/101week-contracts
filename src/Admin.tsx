import { useState } from "react";

function Admin() {
	const [input, setInput] = useState("");
	const [result, setResult] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCheck = async (e: React.FormEvent) => {
		e.preventDefault();
		setResult(null);
		setError(null);
		setLoading(true);
		const trimmed = input.trim();
		if (!trimmed) {
			setError("Please enter a value.");
			setLoading(false);
			return;
		}
		try {
			const resp = await fetch(
				`/check-exists?input=${encodeURIComponent(trimmed)}`,
			);
			if (!resp.ok) throw new Error(await resp.text());
			const data = await resp.json();
			setResult(
				`Result for "${trimmed}": ${
					data.exists ? "Entry exists." : "No entry found."
				}`,
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			setError("Error checking entry: " + message);
			setResult(null);
		} finally {
			setLoading(false);
		}
	};

	return (
		<main>
			<div
				style={{
					maxWidth: 400,
					margin: "40px auto",
					padding: 24,
					border: "1px solid #ccc",
					borderRadius: 8,
					background: "#fafbfc",
				}}
			>
				<form
					onSubmit={handleCheck}
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
					}}
				>
					<label htmlFor="check-input">
						Email or Full Name (First Last):
					</label>
					<input
						id="check-input"
						type="text"
						value={input}
						onChange={e => setInput(e.target.value)}
						required
						style={{ width: "100%" }}
						disabled={loading}
					/>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 8,
						}}
					>
						<button
							type="submit"
							disabled={loading || !input.trim()}
						>
							{loading ? "Checking..." : "Check"}
						</button>
						<button
							type="button"
							onClick={() => {
								setInput("");
								setResult(null);
								setError(null);
							}}
							disabled={loading}
						>
							Clear
						</button>
					</div>
					{result && <div style={{ color: "#1a7f37" }}>{result}</div>}
					{error && <div style={{ color: "#d32f2f" }}>{error}</div>}
				</form>
			</div>
		</main>
	);
}

export default Admin;
