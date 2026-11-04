/** JSON DTO declarations do not add runtime validators to the existing APIs. */
export interface LoginRequest {
	email: string;
	password: string | null;
}

export interface RegisterRequest {
	email: string;
	password: string;
	token?: string;
	code?: string;
}

export interface RegisterResult {
	regVerifyOpen: boolean;
}

export interface RegistrationRole {
	type: number;
	regKeyId: number;
}
