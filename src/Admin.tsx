import { useState } from "react";
import SelectInput from "./components/SelectInput";
import TextInput from "./components/TextInput";
import type { LookupResult } from "./types";

const RSG_OPT_IN = ["ESS"];
const FIELD_LABELS = {
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

function ResultTable({ data }: { data: Record<string, unknown> }) {
	return (
		<table>
			<tbody>
				{Object.entries(data)
					.filter(([k, v]) => {
						return (
							k in FIELD_LABELS &&
							(typeof v === "string" ||
								typeof v === "number" ||
								typeof v === "boolean") &&
							v
						);
					})
					.map(([k, v]) => (
						<tr key={k}>
							<td>
								{FIELD_LABELS[k as keyof typeof FIELD_LABELS]}
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
	);
}

function AdminResults({ results }: { results: LookupResult[] }) {
	if (results.length === 0) {
		return <span>No entry found.</span>;
	}
	if (results.length === 1) {
		return (
			<ResultTable
				data={results[0].data as unknown as Record<string, unknown>}
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
				/>
			))}
		</>
	);
}

function Admin() {
	const [input, setInput] = useState("");
	const [rsg, setRsg] = useState<string>("");
	const [results, setResults] = useState<LookupResult[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCheck = async (e: React.FormEvent) => {
		e.preventDefault();
		setResults(null);
		setError(null);
		setLoading(true);
		const trimmed = input.trim();
		const rsgTrimmed = rsg.trim();
		if (!trimmed) {
			setError("Please enter a value.");
			setLoading(false);
			return;
		}
		if (!rsgTrimmed) {
			setError("Please select an RSG.");
			setLoading(false);
			return;
		}
		try {
			const resp = await fetch(
				`/lookup?input=${encodeURIComponent(
					trimmed,
				)}&rsg=${encodeURIComponent(rsgTrimmed)}`,
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

	return (
		<main className="admin-container">
			<form onSubmit={handleCheck} className="admin-form">
				<SelectInput
					id="rsg"
					name={"rsg"}
					label="RSG:"
					value={rsg}
					onChange={e => setRsg(e.target.value)}
					required
					disabled={loading}
					options={RSG_OPT_IN.map(rsgOption => ({
						value: rsgOption,
						label: rsgOption,
					}))}
				/>
				<TextInput
					id="input"
					name="input"
					label="Email or Full Name:"
					value={input}
					onChange={e => setInput(e.target.value)}
					required
					disabled={loading}
				/>
				<div className="admin-buttons">
					<button
						type="submit"
						disabled={loading || !input.trim() || !rsg.trim()}
					>
						{loading ? "Checking..." : "Check"}
					</button>
					<button
						type="button"
						onClick={() => {
							setInput("");
							setRsg("");
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
							<AdminResults results={results} />
						)}
						{error && <ErrorMessage error={error} />}
					</div>
				)}
			</form>
		</main>
	);
}

export default Admin;
