import { useState } from "react";
import type { LookupResult } from "./types";

const fieldLabels = {
	preferredLanguage: "Preferred Language",
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	phone: "Phone",
	languages: "Languages",
	program: "Program",
	rsg1: "RSG 1",
	rsg2: "RSG 2",
	emergencyName: "Emergency Contact Name",
	emergencyPhone: "Emergency Contact Phone",
	emergencyRelationship: "Emergency Contact Relationship",
	dob: "Date of Birth",
	pronouns: "Pronouns",
	medical: "Medical Information",
	accessibility: "Accessibility Requests",
	fullNameParticipant: "Participant Full Name",
	fullNameParent: "Parent Full Name",
};

function LoadingSpinner() {
	return (
		<div className="admin-loading">
			<span className="spinner" aria-label="Loading" />
		</div>
	);
}

function ErrorMessage({ error }: { error: string }) {
	return (
		<span className="admin-error" aria-live="polite">
			{error}
		</span>
	);
}

function ResultTable({
	data,
	onDelete,
}: {
	data: Record<string, unknown>;
	onDelete?: () => void;
}) {
	return (
		<>
			<table>
				<tbody>
					{Object.entries(data)
						.filter(([k, v]) => {
							return (
								k in fieldLabels &&
								(typeof v === "string" ||
									typeof v === "number" ||
									typeof v === "boolean") &&
								v
							);
						})
						.map(([k, v]) => (
							<tr key={k}>
								<td>
									{fieldLabels[k as keyof typeof fieldLabels]}
								</td>
								<td>
									{typeof v === "string" ||
									typeof v === "number" ||
									typeof v === "boolean"
										? v.toString()
										: ""}
								</td>
							</tr>
						))}
				</tbody>
			</table>
			{onDelete && (
				<button type="button" onClick={onDelete}>
					Delete
				</button>
			)}
		</>
	);
}

function AdminResults({
	results,
	onDelete,
}: {
	results: LookupResult[];
	onDelete: (key: string) => void;
}) {
	if (results.length === 0) {
		return <span>No entry found.</span>;
	}
	if (results.length === 1) {
		return (
			<ResultTable
				data={results[0].data as unknown as Record<string, unknown>}
				onDelete={() => onDelete(results[0].key)}
			/>
		);
	}
	return (
		<>
			<span>{results.length} results found.</span>
			{results.map(({ key, data }) => (
				<ResultTable
					key={key}
					data={data as unknown as Record<string, unknown>}
					onDelete={() => onDelete(key)}
				/>
			))}
		</>
	);
}

function Admin() {
	const [input, setInput] = useState("");
	const [results, setResults] = useState<LookupResult[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCheck = async (e: React.FormEvent) => {
		e.preventDefault();
		setResults(null);
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
				`/lookup?input=${encodeURIComponent(trimmed)}`,
			);
			if (!resp.ok) {
				const msg = await resp.text();
				if (resp.status === 400) {
					setError(
						"Invalid input. Please enter a valid email or full name." +
							(msg && msg !== "Invalid input." ? `\n${msg}` : ""),
					);
				} else if (resp.status === 500) {
					setError(
						"A server error occurred. Please try again later.",
					);
				} else {
					setError(msg || "Unknown error.");
				}
				setResults(null);
				setLoading(false);
				return;
			}
			const data = await resp.json();
			setResults(data);
		} catch {
			setError(
				"A network or unexpected error occurred. Please try again.",
			);
			setResults(null);
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async (key: string) => {
		if (
			!window.confirm(
				"Are you sure you want to delete this entry? This cannot be undone.",
			)
		)
			return;
		setLoading(true);
		setError(null);
		try {
			const resp = await fetch("/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key }),
			});
			if (!resp.ok) {
				const msg = await resp.text();
				setError(msg || "Failed to delete entry.");
			} else {
				// Remove the deleted entry from results
				setResults(results =>
					results ? results.filter(r => r.key !== key) : null,
				);
			}
		} catch {
			setError(
				"A network or unexpected error occurred while deleting. Please try again.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="admin-container">
			<form onSubmit={handleCheck} className="admin-form">
				<label htmlFor="input">Email or Full Name:</label>
				<input
					id="input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					required
					disabled={loading}
				/>
				<div className="admin-buttons">
					<button type="submit" disabled={loading || !input.trim()}>
						{loading ? "Checking..." : "Check"}
					</button>
					<button
						type="button"
						onClick={() => {
							setInput("");
							setResults(null);
							setError(null);
						}}
						disabled={loading}
					>
						Clear
					</button>
				</div>
				{(loading || (results && !loading) || error) && (
					<div aria-live="polite" className="admin-results">
						{loading && <LoadingSpinner />}
						{results && !loading && (
							<AdminResults
								results={results}
								onDelete={handleDelete}
							/>
						)}
						{error && <ErrorMessage error={error} />}
					</div>
				)}
			</form>
		</main>
	);
}

export default Admin;
