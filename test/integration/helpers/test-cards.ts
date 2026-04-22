/**
 * Тестовые карты из раздела #testirovanie документации CloudPayments.
 * Используется нашими интеграционками для детерминированных сценариев.
 *
 * Все карты принимают любой непросроченный ExpDate и произвольный CVV.
 * Default ExpDate = 12/30, CVV = 911 (911 — часто используется в примерах CP).
 */
import type { CardInput } from "./cryptogram.js";

const DEFAULTS = { expDateMonth: "12", expDateYear: "30", cvv: "911" } as const;

export const TEST_CARDS = {
	/** Visa, одностадийка + токен: approved. */
	visaNo3dsApproved: { ...DEFAULTS, cardNumber: "4000 0000 0000 3055" },
	/** Mastercard без 3DS, approved. */
	mcNo3dsApproved: { ...DEFAULTS, cardNumber: "5205 0000 0000 3055" },
	/** Visa с 3-D Secure, попадёт в 3DS challenge. */
	visa3dsApproved: { ...DEFAULTS, cardNumber: "4242 4242 4242 4242" },
	/** Visa без 3DS — Insufficient funds. */
	visaNo3dsDecline: { ...DEFAULTS, cardNumber: "4000 0566 5566 5556" },
	/** Mastercard без 3DS — Insufficient funds. */
	mcNo3dsDecline: { ...DEFAULTS, cardNumber: "5404 0000 0000 0043" },
} as const satisfies Record<string, CardInput>;
