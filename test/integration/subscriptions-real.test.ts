/**
 * Subscriptions lifecycle — полный e2e.
 *
 *  1. Создаём исходную транзакцию с SaveCard=true → получаем Token
 *  2. subscriptions.create с этим Token → Subscription в статусе "Active"
 *  3. get(Id) → та же
 *  4. findByAccount(accountId) → массив содержит нашу
 *  5. update → изменённые поля
 *  6. cancel → void
 */
import { describe, expect, test } from "bun:test";
import { generateCryptogram } from "./helpers/cryptogram.js";
import { TEST_CARDS } from "./helpers/test-cards.js";
import { CP_TEST_PUBLIC_ID, HAS_CREDS, makeTestClient } from "./setup.js";

describe.skipIf(!HAS_CREDS)("integration: subscriptions real lifecycle", () => {
	test("create → get → findByAccount → update → cancel", async () => {
		const cp = makeTestClient();
		const accountId = `sdk-sub-${Date.now()}`;

		const cryptogram = await generateCryptogram({
			publicId: CP_TEST_PUBLIC_ID,
			card: TEST_CARDS.visaNo3dsApproved,
		});
		const initial = await cp.payments.chargeCryptogram({
			Amount: 10,
			Currency: "RUB",
			IpAddress: "127.0.0.1",
			CardCryptogramPacket: cryptogram,
			AccountId: accountId,
			SaveCard: true,
			Description: "sdk integration: initial for subscription",
		});
		expect(initial.Token).toBeTruthy();
		if (!initial.Token) throw new Error("Token not returned by initial charge");

		const startDate = new Date(Date.now() + 60_000).toISOString();
		const created = await cp.subscriptions.create({
			Token: initial.Token,
			AccountId: accountId,
			Description: "sdk integration subscription",
			Email: "sdk-integration-test@onreza.local",
			Amount: 199,
			Currency: "RUB",
			RequireConfirmation: false,
			StartDate: startDate,
			Interval: "Month",
			Period: 1,
		});
		expect(created.Status).toBe("Active");
		expect(created.AccountId).toBe(accountId);
		expect(created.Amount).toBe(199);

		const fetched = await cp.subscriptions.get({ Id: created.Id });
		expect(fetched.Id).toBe(created.Id);
		expect(fetched.Status).toBe("Active");

		const found = await cp.subscriptions.findByAccount({ accountId });
		expect(Array.isArray(found)).toBe(true);
		expect(found.some((s) => s.Id === created.Id)).toBe(true);

		const updated = await cp.subscriptions.update({
			Id: created.Id,
			Amount: 249,
		});
		expect(updated.Amount).toBe(249);

		await cp.subscriptions.cancel({ Id: created.Id });

		const afterCancel = await cp.subscriptions.get({ Id: created.Id });
		expect(afterCancel.Status).toBe("Cancelled");
	}, 120_000);
});
