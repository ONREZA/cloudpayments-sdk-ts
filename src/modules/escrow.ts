import type { EscrowGetInfoRequest } from "../_generated/endpoints.js";
import { ESCROW_GET_INFO_URL } from "../_generated/endpoints.js";
import type { EscrowInfo } from "../types.js";
import { BaseModule, type ExecOptions } from "./base.js";

export class EscrowModule extends BaseModule {
	/** Получить состояние и транзакции безопасных сделок. */
	getInfo(body: EscrowGetInfoRequest, opts?: ExecOptions): Promise<EscrowInfo[]> {
		return this.exec<EscrowGetInfoRequest, EscrowInfo[]>(ESCROW_GET_INFO_URL, body, opts, {
			replaySafety: "safe",
		});
	}
}
