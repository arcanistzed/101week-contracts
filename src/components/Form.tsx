import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Submission } from "../types";
import SignatureField from "./SignatureField";
import TextArea from "./TextArea";
import TextInput from "./TextInput";

const REQUIRE_PARTICIPANT_SIGNATURE_FOR_MINORS = true;
const LOCAL_STORAGE_KEY = "101week-contracts.form.v1";
const MAX_SIGNATURE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_IMAGE_PREFIXES = [
	"data:image/png;base64,",
	"data:image/jpeg;base64,",
];

type FormField = keyof Omit<Submission, "preferredLanguage">;

type FormErrors = Partial<Record<FormField | "form", string>>;

type FormProps = { submitted: boolean; setSubmitted: (v: boolean) => void };

interface FormContextType {
	formData: typeof defaultFormData;
	errors: FormErrors;
	handleChange: (
		e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => void;
	getErrorId: (name: FormField) => string | undefined;
	today: string;
	isAdult: boolean;
}

const defaultFormData: Omit<Submission, "preferredLanguage"> = {
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
	dateParticipant: new Date().toISOString().slice(0, 10),
	fullNameParent: "",
	signatureParent: "",
	dateParent: new Date().toISOString().slice(0, 10),
};

const validateBiographical = (
	formData: typeof defaultFormData,
	t: TFunction,
) => {
	const errors: FormErrors = {};
	if (!formData.firstName.trim()) errors.firstName = t("form.error.required");
	if (!formData.lastName.trim()) errors.lastName = t("form.error.required");
	if (formData.dob && formData.dob > new Date().toISOString().slice(0, 10))
		errors.dob = t("form.error.futureDate");
	if (!formData.languages.trim()) errors.languages = t("form.error.required");
	return errors;
};

const validateAcademic = (formData: typeof defaultFormData, t: TFunction) => {
	const errors: FormErrors = {};
	if (!formData.program.trim()) errors.program = t("form.error.required");
	if (!formData.rsg1.trim()) errors.rsg1 = t("form.error.required");
	return errors;
};

const validateContact = (formData: typeof defaultFormData, t: TFunction) => {
	const errors: FormErrors = {};
	if (!formData.email.trim()) errors.email = t("form.error.required");
	else if (!/^\S+@\S+\.\S+$/.test(formData.email))
		errors.email = t("form.error.email");
	if (!formData.phone.trim()) errors.phone = t("form.error.required");
	return errors;
};

const validateEmergency = (formData: typeof defaultFormData, t: TFunction) => {
	const errors: FormErrors = {};
	if (!formData.emergencyName.trim())
		errors.emergencyName = t("form.error.required");
	if (!formData.emergencyPhone.trim())
		errors.emergencyPhone = t("form.error.required");
	return errors;
};

const validateParticipant = (
	formData: typeof defaultFormData,
	t: TFunction,
	isAdult: boolean,
	MAX_SIGNATURE_SIZE: number,
) => {
	const errors: FormErrors = {};
	if (isAdult || (!isAdult && REQUIRE_PARTICIPANT_SIGNATURE_FOR_MINORS)) {
		if (!formData.fullNameParticipant?.trim())
			errors.fullNameParticipant = t("form.error.required");
		if (
			!formData.signatureParticipant ||
			formData.signatureParticipant === ""
		) {
			errors.signatureParticipant = t("form.error.required");
		} else if (typeof formData.signatureParticipant === "string") {
			const isAllowedType = ALLOWED_IMAGE_PREFIXES.some(
				prefix =>
					!!formData.signatureParticipant &&
					formData.signatureParticipant.startsWith(prefix),
			);
			if (!isAllowedType) {
				errors.signatureParticipant = t("signature.errorTypeAllowed", {
					types: "PNG, JPEG",
				});
			} else {
				const base64 =
					formData.signatureParticipant.split(",")[1] || "";
				if ((base64.length * 3) / 4 > MAX_SIGNATURE_SIZE) {
					errors.signatureParticipant = t("signature.errorSize", {
						size: "1MB",
					});
				}
			}
		}
	}
	return errors;
};

const validateParent = (
	formData: typeof defaultFormData,
	t: TFunction,
	isAdult: boolean,
	MAX_SIGNATURE_SIZE: number,
) => {
	const errors: FormErrors = {};
	if (!isAdult) {
		if (!formData.fullNameParent?.trim())
			errors.fullNameParent = t("form.error.required");
		if (!formData.signatureParent || formData.signatureParent === "") {
			errors.signatureParent = t("form.error.required");
		} else if (typeof formData.signatureParent === "string") {
			const isAllowedType = ALLOWED_IMAGE_PREFIXES.some(
				prefix =>
					!!formData.signatureParent &&
					formData.signatureParent.startsWith(prefix),
			);
			if (!isAllowedType) {
				errors.signatureParent = t("signature.errorTypeAllowed", {
					types: "PNG, JPEG",
				});
			} else {
				const base64 = formData.signatureParent.split(",")[1] || "";
				if ((base64.length * 3) / 4 > MAX_SIGNATURE_SIZE) {
					errors.signatureParent = t("signature.errorSize", {
						size: "1MB",
					});
				}
			}
		}
	}
	return errors;
};

const FormContext = createContext<FormContextType | undefined>(undefined);

function useFormContext() {
	const ctx = useContext(FormContext);
	if (!ctx)
		throw new Error(
			"useFormContext must be used within FormContext.Provider",
		);
	return ctx;
}

function FieldErrorFor({ name }: { name: FormField }) {
	const { errors } = useFormContext();
	const id = `${name}-error`;
	if (!errors[name]) return null;
	return (
		<div className="form-error" role="alert" id={id}>
			{errors[name]}
		</div>
	);
}

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

function BiographicalSection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId } = useFormContext();
	return (
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
			<FieldErrorFor name="firstName" />
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
			<FieldErrorFor name="lastName" />
			<TextInput
				label={t("form.biographical.dob")}
				name="dob"
				type="date"
				value={formData.dob ?? ""}
				onChange={handleChange}
				aria-invalid={!!errors.dob}
				aria-describedby={getErrorId("dob")}
			/>
			<FieldErrorFor name="dob" />
			<TextInput
				label={t("form.biographical.pronouns")}
				name="pronouns"
				value={formData.pronouns ?? ""}
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
			<FieldErrorFor name="languages" />
		</fieldset>
	);
}

function AcademicSection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId } = useFormContext();
	return (
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
			<FieldErrorFor name="program" />
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
					<FieldErrorFor name="rsg1" />
					<TextInput
						label={t("form.academic.rsg.2")}
						name="rsg2"
						value={formData.rsg2 ?? ""}
						onChange={handleChange}
					/>
				</div>
			</div>
		</fieldset>
	);
}

function ContactSection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId } = useFormContext();
	return (
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
			<FieldErrorFor name="email" />
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
			<FieldErrorFor name="phone" />
		</fieldset>
	);
}

function HealthSection() {
	const { t } = useTranslation();
	const { formData, handleChange } = useFormContext();
	return (
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
				value={formData.medical ?? ""}
				onChange={handleChange}
			/>
			<TextArea
				label={t("form.health.accessibility")}
				name="accessibility"
				value={formData.accessibility ?? ""}
				onChange={handleChange}
			/>
		</fieldset>
	);
}

function EmergencySection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId } = useFormContext();
	return (
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
			<FieldErrorFor name="emergencyName" />
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
			<FieldErrorFor name="emergencyPhone" />
			<TextInput
				label={t("form.emergency.relationship")}
				name="emergencyRelationship"
				value={formData.emergencyRelationship ?? ""}
				onChange={handleChange}
			/>
		</fieldset>
	);
}

function SignatureSection() {
	const { t } = useTranslation();
	return (
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
	);
}

function ParticipantSection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId, isAdult, today } =
		useFormContext();
	return (
		<fieldset className="form-section">
			<TextInput
				label={t("form.participant.fullName")}
				name="fullNameParticipant"
				value={formData.fullNameParticipant ?? ""}
				onChange={handleChange}
				required={isAdult}
				aria-required={isAdult ? "true" : undefined}
				aria-invalid={!!errors.fullNameParticipant}
				aria-describedby={getErrorId("fullNameParticipant")}
			/>
			<FieldErrorFor name="fullNameParticipant" />
			<SignatureField
				label={t("form.participant.signature")}
				name="signatureParticipant"
				value={formData.signatureParticipant ?? ""}
				onChange={handleChange}
				aria-required={isAdult ? "true" : undefined}
				aria-invalid={!!errors.signatureParticipant}
				aria-describedby={getErrorId("signatureParticipant")}
			/>
			<FieldErrorFor name="signatureParticipant" />
			<TextInput
				label={t("form.participant.date")}
				name="dateParticipant"
				type="date"
				value={formData.dateParticipant ?? today}
				readOnly
				tabIndex={-1}
				aria-readonly="true"
			/>
		</fieldset>
	);
}

function ParentSection() {
	const { t } = useTranslation();
	const { formData, errors, handleChange, getErrorId, today } =
		useFormContext();
	return (
		<fieldset className="form-section">
			<legend>{t("form.parent.title")}</legend>
			<p>
				<Trans
					i18nKey="form.parent.agreement"
					components={{ b: <b /> }}
				/>
			</p>
			<TextInput
				label={t("form.parent.fullName")}
				name="fullNameParent"
				value={formData.fullNameParent ?? ""}
				onChange={handleChange}
				required
				aria-required="true"
				aria-invalid={!!errors.fullNameParent}
				aria-describedby={getErrorId("fullNameParent")}
			/>
			<FieldErrorFor name="fullNameParent" />
			<SignatureField
				label={t("form.parent.signature")}
				name="signatureParent"
				value={formData.signatureParent ?? ""}
				onChange={handleChange}
				aria-required="true"
				aria-invalid={!!errors.signatureParent}
				aria-describedby={getErrorId("signatureParent")}
			/>
			<FieldErrorFor name="signatureParent" />
			<TextInput
				label={t("form.parent.date")}
				name="dateParent"
				type="date"
				value={formData.dateParent ?? today}
				readOnly
				tabIndex={-1}
				aria-readonly="true"
			/>
		</fieldset>
	);
}

function Form({ submitted, setSubmitted }: FormProps) {
	const { t, i18n } = useTranslation();
	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
	const [formData, setFormData] = useState<
		Omit<Submission, "preferredLanguage">
	>({ ...defaultFormData, dateParticipant: today, dateParent: today });
	const [isAdult, setIsAdult] = useState(true);
	const [errors, setErrors] = useState<FormErrors>({});
	const [submitting, setSubmitting] = useState(false);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			const { name, value } = e.target;
			setFormData(prev => ({ ...prev, [name]: value }));
		},
		[],
	);

	const getErrorId = useCallback(
		(name: FormField) => (errors[name] ? `${name}-error` : undefined),
		[errors],
	);

	const validate = useCallback(() => {
		return {
			...validateBiographical(formData, t),
			...validateAcademic(formData, t),
			...validateContact(formData, t),
			...validateEmergency(formData, t),
			...validateParticipant(formData, t, isAdult, MAX_SIGNATURE_SIZE),
			...validateParent(formData, t, isAdult, MAX_SIGNATURE_SIZE),
		};
	}, [formData, t, isAdult]);

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
		const payload = {
			...formData,
			preferredLanguage: i18n.language.toLowerCase().startsWith("fr")
				? "FR"
				: "EN",
		};
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

	useEffect(() => {
		if (formData.dob) {
			setIsAdult(isEighteenOrOlder(formData.dob));
		}
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
				<FormContext.Provider
					value={{
						formData,
						errors,
						handleChange,
						getErrorId,
						today,
						isAdult,
					}}
				>
					<form onSubmit={handleSubmit} className="form">
						<BiographicalSection />
						<AcademicSection />
						<ContactSection />
						<HealthSection />
						<EmergencySection />
						<SignatureSection />
						<ParticipantSection />
						{!isAdult && <ParentSection />}
						<button type="submit" disabled={submitting}>
							{t("form.submit")}
						</button>
						{errors.form && (
							<div className="form-error" role="alert">
								{errors.form}
							</div>
						)}
					</form>
				</FormContext.Provider>
			)}
		</>
	);
}

export default Form;
