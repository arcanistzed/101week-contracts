export type Submission = Entry & {
	signatureParticipant?: string;
	signatureParent?: string;
};

export interface Entry {
	preferredLanguage: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	languages: string;
	program: string;
	rsg1: string;
	rsg2?: string;
	emergencyName: string;
	emergencyPhone: string;
	emergencyRelationship?: string;
	dob?: string;
	pronouns?: string;
	medical?: string;
	accessibility?: string;
	fullNameParticipant?: string;
	dateParticipant?: string;
	fullNameParent?: string;
	dateParent?: string;
	signaturePaths?: {
		signatureParticipant?: string;
		signatureParent?: string;
	};
}

export type LookupResult = { key: string; data: Entry };
