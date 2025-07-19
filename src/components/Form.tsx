import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import SignatureField from "./SignatureField";
import TextArea from "./TextArea";
import TextInput from "./TextInput";

function isEighteenOrOlder(dob: string): boolean {
	if (!dob) return true;
	const birthDate = new Date(dob);
	const today = new Date();
	const age = today.getFullYear() - birthDate.getFullYear();
	const m = today.getMonth() - birthDate.getMonth();
	if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
		return age - 1 >= 18;
	}
	return age >= 18;
}

function Form() {
	const { t } = useTranslation();
	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		dob: "",
		pronouns: "",
		languages: "",
		program: "",
		rsg1: "",
		rsg2: "",
		email: "",
		phone: "",
		emergencyName: "",
		emergencyPhone: "",
		emergencyRelationship: "",
		medical: "",
		accessibility: "",
		fullNameParticipant: "",
		signatureParticipant: "",
		dateParticipant: today,
		fullNameParent: "",
		signatureParent: "",
		dateParent: today,
	});
	const [isAdult, setIsAdult] = useState(true);
	const [errors, setErrors] = useState<{ [key: string]: string }>({});
	const [submitted, setSubmitted] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const LOCAL_STORAGE_KEY = "101week-contracts.form.v1";
	const MAX_SIGNATURE_SIZE = 1024 * 1024; // 1MB

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		const { name, value } = e.target;
		setFormData(prev => ({ ...prev, [name]: value }));
	};

	const validate = () => {
		const newErrors: { [key: string]: string } = {};
		const todayStr = new Date().toISOString().slice(0, 10);
		if (!formData.firstName.trim())
			newErrors.firstName = t("form.error.required");
		if (!formData.lastName.trim())
			newErrors.lastName = t("form.error.required");
		if (!formData.email.trim()) newErrors.email = t("form.error.required");
		else if (!/^\S+@\S+\.\S+$/.test(formData.email))
			newErrors.email = t("form.error.email");
		if (!formData.phone.trim()) newErrors.phone = t("form.error.required");
		if (!formData.languages.trim())
			newErrors.languages = t("form.error.required");
		if (!formData.program.trim())
			newErrors.program = t("form.error.required");
		if (!formData.rsg1.trim()) newErrors.rsg1 = t("form.error.required");
		if (!formData.emergencyName.trim())
			newErrors.emergencyName = t("form.error.required");
		if (!formData.emergencyPhone.trim())
			newErrors.emergencyPhone = t("form.error.required");
		if (
			!formData.signatureParticipant ||
			formData.signatureParticipant === ""
		)
			newErrors.signatureParticipant = t("form.error.required");
		if (
			formData.signatureParticipant &&
			typeof formData.signatureParticipant === "string" &&
			formData.signatureParticipant.startsWith("data:image/")
		) {
			const base64 = formData.signatureParticipant.split(",")[1] || "";
			if ((base64.length * 3) / 4 > MAX_SIGNATURE_SIZE) {
				newErrors.signatureParticipant = t("signature.errorSize", {
					size: "1MB",
				});
			}
		}
		if (formData.dob && formData.dob > todayStr)
			newErrors.dob = t("form.error.futureDate");
		if (!isAdult) {
			if (!formData.fullNameParent.trim())
				newErrors.fullNameParent = t("form.error.required");
			if (!formData.signatureParent || formData.signatureParent === "")
				newErrors.signatureParent = t("form.error.required");
			// Parent signature size check
			if (
				formData.signatureParent &&
				typeof formData.signatureParent === "string" &&
				formData.signatureParent.startsWith("data:image/")
			) {
				const base64 = formData.signatureParent.split(",")[1] || "";
				if ((base64.length * 3) / 4 > MAX_SIGNATURE_SIZE) {
					newErrors.signatureParent = t("signature.errorSize", {
						size: "1MB",
					});
				}
			}
		}
		return newErrors;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (submitting) return;
		setSubmitting(true);
		const validationErrors = validate();
		setErrors(validationErrors);
		if (Object.keys(validationErrors).length > 0) {
			setSubmitting(false);
			return;
		}
		const payload = { ...formData };
		try {
			const response = await fetch("/form-handler", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				const text = await response.text();
				setErrors({ form: text });
				setSubmitting(false);
				return;
			}
			const data = await response.json();
			if (data.ok) {
				setSubmitted(true);
				setErrors({});
				localStorage.removeItem(LOCAL_STORAGE_KEY);
			} else {
				setErrors({ form: "Unknown error" });
			}
		} catch (err) {
			setErrors({
				form: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setSubmitting(false);
		}
	};

	const getErrorId = (name: string) =>
		errors[name] ? `${name}-error` : undefined;

	useEffect(() => {
		setIsAdult(isEighteenOrOlder(formData.dob));
	}, [formData.dob]);

	useEffect(() => {
		const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				setFormData(f => ({ ...f, ...parsed }));
			} catch {
				console.error("Failed to parse saved form data");
			}
		}
	}, []);

	useEffect(() => {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formData));
	}, [formData]);

	return (
		<>
			{submitted ? (
				<div className="form-success" role="status">
					{t("form.success")}
				</div>
			) : (
				<form onSubmit={handleSubmit} className="form">
					{errors.form && (
						<div className="form-error" role="alert">
							{errors.form}
						</div>
					)}
					<fieldset className="form-section columns">
						<legend>{t("form.biographical.title")}</legend>
						<TextInput
							label={t("form.biographical.firstName")}
							name="firstName"
							value={formData.firstName}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.firstName}
							aria-describedby={getErrorId("firstName")}
						/>
						{errors.firstName && (
							<div
								className="form-error"
								role="alert"
								id="firstName-error"
							>
								{errors.firstName}
							</div>
						)}
						<TextInput
							label={t("form.biographical.lastName")}
							name="lastName"
							value={formData.lastName}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.lastName}
							aria-describedby={getErrorId("lastName")}
						/>
						{errors.lastName && (
							<div
								className="form-error"
								role="alert"
								id="lastName-error"
							>
								{errors.lastName}
							</div>
						)}
						<TextInput
							label={t("form.biographical.dob")}
							name="dob"
							type="date"
							value={formData.dob}
							onChange={handleChange}
							aria-invalid={!!errors.dob}
							aria-describedby={getErrorId("dob")}
						/>
						{errors.dob && (
							<div
								className="form-error"
								role="alert"
								id="dob-error"
							>
								{errors.dob}
							</div>
						)}
						<TextInput
							label={t("form.biographical.pronouns")}
							name="pronouns"
							value={formData.pronouns}
							onChange={handleChange}
						/>
						<TextInput
							label={t("form.biographical.languages")}
							name="languages"
							value={formData.languages}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.languages}
							aria-describedby={getErrorId("languages")}
							style={{ gridColumn: "span 2" }}
						/>
						{errors.languages && (
							<div
								className="form-error"
								role="alert"
								id="languages-error"
							>
								{errors.languages}
							</div>
						)}
					</fieldset>

					<fieldset className="form-section">
						<legend>{t("form.academic.title")}</legend>
						<TextInput
							label={t("form.academic.program")}
							name="program"
							value={formData.program}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.program}
							aria-describedby={getErrorId("program")}
						/>
						{errors.program && (
							<div
								className="form-error"
								role="alert"
								id="program-error"
							>
								{errors.program}
							</div>
						)}
						<div className="form-group">
							<h3>{t("form.academic.rsg.question")}</h3>
							<small>{t("form.academic.rsg.explanation")}</small>
							<div className="columns">
								<TextInput
									label={t("form.academic.rsg.1")}
									name="rsg1"
									value={formData.rsg1}
									onChange={handleChange}
									required
									aria-required="true"
									aria-invalid={!!errors.rsg1}
									aria-describedby={getErrorId("rsg1")}
								/>
								{errors.rsg1 && (
									<div
										className="form-error"
										role="alert"
										id="rsg1-error"
									>
										{errors.rsg1}
									</div>
								)}
								<TextInput
									label={t("form.academic.rsg.2")}
									name="rsg2"
									value={formData.rsg2}
									onChange={handleChange}
								/>
							</div>
						</div>
					</fieldset>

					<fieldset className="form-section columns">
						<legend>{t("form.contact.title")}</legend>
						<TextInput
							label={t("form.contact.email")}
							name="email"
							type="email"
							value={formData.email}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.email}
							aria-describedby={getErrorId("email")}
							autoComplete="email"
						/>
						{errors.email && (
							<div
								className="form-error"
								role="alert"
								id="email-error"
							>
								{errors.email}
							</div>
						)}
						<TextInput
							label={t("form.contact.phone")}
							name="phone"
							type="tel"
							value={formData.phone}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.phone}
							aria-describedby={getErrorId("phone")}
							autoComplete="tel"
						/>
						{errors.phone && (
							<div
								className="form-error"
								role="alert"
								id="phone-error"
							>
								{errors.phone}
							</div>
						)}
					</fieldset>

					<fieldset className="form-section">
						<legend>{t("form.health.title")}</legend>
						<TextArea
							label={
								<Trans
									i18nKey="form.health.medical"
									components={{
										a: (
											<a
												href="mailto:internal@uottawaess.ca"
												target="_blank"
												rel="noopener noreferrer"
											/>
										),
									}}
								/>
							}
							name="medical"
							value={formData.medical}
							onChange={handleChange}
						/>
						<TextArea
							label={t("form.health.accessibility")}
							name="accessibility"
							value={formData.accessibility}
							onChange={handleChange}
						/>
					</fieldset>

					<fieldset className="form-section columns">
						<legend>{t("form.emergency.title")}</legend>
						<TextInput
							label={t("form.emergency.name")}
							name="emergencyName"
							value={formData.emergencyName}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.emergencyName}
							aria-describedby={getErrorId("emergencyName")}
						/>
						{errors.emergencyName && (
							<div
								className="form-error"
								role="alert"
								id="emergencyName-error"
							>
								{errors.emergencyName}
							</div>
						)}
						<TextInput
							label={t("form.emergency.phone")}
							name="emergencyPhone"
							type="tel"
							value={formData.emergencyPhone}
							onChange={handleChange}
							required
							aria-required="true"
							aria-invalid={!!errors.emergencyPhone}
							aria-describedby={getErrorId("emergencyPhone")}
						/>
						{errors.emergencyPhone && (
							<div
								className="form-error"
								role="alert"
								id="emergencyPhone-error"
							>
								{errors.emergencyPhone}
							</div>
						)}
						<TextInput
							label={t("form.emergency.relationship")}
							name="emergencyRelationship"
							value={formData.emergencyRelationship}
							onChange={handleChange}
						/>
					</fieldset>

					<fieldset className="form-section">
						<legend>{t("form.signature.title")}</legend>
						<p>
							<b>{t("form.signature.legal")}</b>
						</p>
						<p>
							<Trans
								i18nKey="form.signature.preamble"
								components={{ b: <b /> }}
							/>
						</p>
						<ol type="a">
							{(
								t("form.signature.read", {
									returnObjects: true,
								}) as string[]
							).map((item, idx) => (
								<li key={idx}>{item}</li>
							))}
						</ol>
						<p>
							<Trans
								i18nKey="form.signature.copies"
								components={{
									b: <b />,
									a: (
										<a
											href={t("form.signature.copiesUrl")}
											target="_blank"
											rel="noopener noreferrer"
										/>
									),
								}}
								values={{ url: t("form.signature.copiesUrl") }}
							/>
						</p>
						<p>
							<b>{t("form.signature.agreement")}</b>
						</p>
					</fieldset>

					<fieldset className="form-section">
						<TextInput
							label={t("form.participant.fullName")}
							name="fullNameParticipant"
							value={formData.fullNameParticipant}
							onChange={handleChange}
						/>
						<SignatureField
							label={t("form.participant.signature")}
							name="signatureParticipant"
							value={formData.signatureParticipant}
							onChange={handleChange}
							aria-required="true"
							aria-invalid={!!errors.signatureParticipant}
							aria-describedby={getErrorId(
								"signatureParticipant",
							)}
						/>
						{errors.signatureParticipant && (
							<div
								className="form-error"
								role="alert"
								id="signatureParticipant-error"
							>
								{errors.signatureParticipant}
							</div>
						)}
						<TextInput
							label={t("form.participant.date")}
							name="dateParticipant"
							type="date"
							value={formData.dateParticipant}
							readOnly
							tabIndex={-1}
							aria-readonly="true"
						/>
					</fieldset>

					{!isAdult && (
						<fieldset className="form-section">
							<legend>{t("form.parent.title")}</legend>
							<p>
								<Trans
									i18nKey="form.parent.agreement"
									components={{
										b: <b />,
									}}
								/>
							</p>
							<TextInput
								label={t("form.parent.fullName")}
								name="fullNameParent"
								value={formData.fullNameParent}
								onChange={handleChange}
								required
								aria-required="true"
								aria-invalid={!!errors.fullNameParent}
								aria-describedby={getErrorId("fullNameParent")}
							/>
							{errors.fullNameParent && (
								<div
									className="form-error"
									role="alert"
									id="fullNameParent-error"
								>
									{errors.fullNameParent}
								</div>
							)}
							<SignatureField
								label={t("form.parent.signature")}
								name="signatureParent"
								value={formData.signatureParent}
								onChange={handleChange}
								aria-required="true"
								aria-invalid={!!errors.signatureParent}
								aria-describedby={getErrorId("signatureParent")}
							/>
							{errors.signatureParent && (
								<div
									className="form-error"
									role="alert"
									id="signatureParent-error"
								>
									{errors.signatureParent}
								</div>
							)}
							<TextInput
								label={t("form.parent.date")}
								name="dateParent"
								type="date"
								value={formData.dateParent}
								readOnly
								tabIndex={-1}
								aria-readonly="true"
							/>
						</fieldset>
					)}

					<button type="submit" disabled={submitting}>
						{t("form.submit")}
					</button>
				</form>
			)}
		</>
	);
}

export default Form;
