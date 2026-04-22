import { describe, expect, test } from "bun:test";
import { buildBasicAuthHeader } from "../../src/auth/basic.js";

describe("buildBasicAuthHeader", () => {
	test("encodes publicId:apiSecret as Basic header", () => {
		const header = buildBasicAuthHeader({ publicId: "pk_test", apiSecret: "secret" });
		expect(header).toBe("Basic cGtfdGVzdDpzZWNyZXQ=");
	});

	test("handles utf-8 in credentials", () => {
		const header = buildBasicAuthHeader({ publicId: "pk_тест", apiSecret: "секрет" });
		// Проверяем через round-trip decode
		const decoded = atob(header.replace("Basic ", ""));
		// Декодируем бинарно в utf-8
		const bytes = Uint8Array.from(decoded, (ch) => ch.charCodeAt(0));
		expect(new TextDecoder().decode(bytes)).toBe("pk_тест:секрет");
	});
});
