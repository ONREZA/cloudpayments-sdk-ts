import type {
	SberPayCreateLinkRequest,
	SberPayCreateQrImageRequest,
	SbpCreateLinkRequest,
	SbpCreateQrImageRequest,
	SbpListBanksRequest,
	TPayCreateLinkRequest,
	TPayCreateQrImageRequest,
} from "../_generated/endpoints.js";
import {
	SBER_PAY_CREATE_LINK_URL,
	SBER_PAY_CREATE_QR_IMAGE_URL,
	SBP_CREATE_LINK_URL,
	SBP_CREATE_QR_IMAGE_URL,
	SBP_LIST_BANKS_URL,
	T_PAY_CREATE_LINK_URL,
	T_PAY_CREATE_QR_IMAGE_URL,
} from "../_generated/endpoints.js";
import type { AlternativePaymentIntent, SbpBankList } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

export class TPayModule extends BaseModule {
	createLink(body: TPayCreateLinkRequest, opts?: ExecOptions): Promise<AlternativePaymentIntent> {
		return this.exec<TPayCreateLinkRequest, AlternativePaymentIntent>(
			T_PAY_CREATE_LINK_URL,
			body,
			opts,
		);
	}

	createQrImage(
		body: TPayCreateQrImageRequest,
		opts?: ExecOptions,
	): Promise<AlternativePaymentIntent> {
		return this.exec<TPayCreateQrImageRequest, AlternativePaymentIntent>(
			T_PAY_CREATE_QR_IMAGE_URL,
			body,
			opts,
		);
	}
}

export class SbpModule extends BaseModule {
	createLink(body: SbpCreateLinkRequest, opts?: ExecOptions): Promise<AlternativePaymentIntent> {
		return this.exec<SbpCreateLinkRequest, AlternativePaymentIntent>(
			SBP_CREATE_LINK_URL,
			body,
			opts,
		);
	}

	createQrImage(
		body: SbpCreateQrImageRequest,
		opts?: ExecOptions,
	): Promise<AlternativePaymentIntent> {
		return this.exec<SbpCreateQrImageRequest, AlternativePaymentIntent>(
			SBP_CREATE_QR_IMAGE_URL,
			body,
			opts,
		);
	}

	listBanks(body: SbpListBanksRequest, opts?: ExecOptions): Promise<SbpBankList[]> {
		return this.exec<SbpListBanksRequest, SbpBankList[]>(SBP_LIST_BANKS_URL, body, opts, {
			replaySafety: "safe",
		});
	}
}

export class SberPayModule extends BaseModule {
	createLink(
		body: SberPayCreateLinkRequest,
		opts?: ExecOptions,
	): Promise<AlternativePaymentIntent> {
		return this.exec<SberPayCreateLinkRequest, AlternativePaymentIntent>(
			SBER_PAY_CREATE_LINK_URL,
			body,
			opts,
		);
	}

	createQrImage(
		body: SberPayCreateQrImageRequest,
		opts?: ExecOptions,
	): Promise<AlternativePaymentIntent> {
		return this.exec<SberPayCreateQrImageRequest, AlternativePaymentIntent>(
			SBER_PAY_CREATE_QR_IMAGE_URL,
			body,
			opts,
		);
	}
}
