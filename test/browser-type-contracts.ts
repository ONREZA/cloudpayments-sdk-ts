import type {
	Checkout,
	CheckoutConstructor,
	CheckoutValidationErrors,
	CloudPaymentsWidget,
	CloudPaymentsWidgetConstructor,
	PaymentBlocks,
	PaymentBlocksConstructor,
	WidgetIntentOptions,
} from "../src/browser/index.js";
import type { DolyameCreatePaymentLinkRequest } from "../src/index.js";

const intent: WidgetIntentOptions = {
	publicTerminalId: "pk_test",
	amount: 100,
	currency: "RUB",
	paymentSchema: "Single",
	restrictedPaymentMethods: ["Sbp", "Dolyame"],
	emailBehavior: "Optional",
	receipt: {
		items: [
			{
				label: "Marked item",
				price: 100,
				quantity: 1,
				amount: 100,
				AgentSign: 6,
				AgentData: { TransferOperatorName: "Operator" },
				PurveyorData: { Phone: "+71234567890", Name: "Supplier", Inn: "1234567890" },
				ProductCodeData: { CodeProductNomenclature: "30313032" },
			},
		],
	},
};

declare const widget: CloudPaymentsWidget;
declare const Widget: CloudPaymentsWidgetConstructor;
declare const blocks: PaymentBlocks;
declare const PaymentBlocksClass: PaymentBlocksConstructor;
declare const checkout: Checkout;
declare const CheckoutClass: CheckoutConstructor;

void widget.start(intent);
void new Widget({ language: "de-DE", sbpSupport: true });
void new PaymentBlocksClass(
	{
		...intent,
		userInfo: { accountId: "user-42" },
		autoClose: 3,
		cryptogramMode: true,
		sbpSupport: true,
		email: "user@example.com",
	},
	{
		appearance: {
			colors: { primaryButtonColor: [29, 250, 5] },
			font: {
				family: "Inter",
				items: [{ url: "/inter.woff2", style: "normal", weight: "400", format: "woff2" }],
			},
		},
	},
);
blocks.update({ ...intent, amount: 200 });
blocks.on("success", (result) => result.data?.transactionId);
void checkout.createPaymentCryptogram({
	cardNumber: "4242 4242 4242 4242",
	expDateMonthYear: "12/30",
	cvv: "911",
});
void new CheckoutClass({ publicId: "pk_test" });
// @ts-expect-error Legacy Widget API намеренно не входит в публичный type surface.
widget.pay;
// @ts-expect-error Legacy Widget API намеренно не входит в публичный type surface.
widget.charge;
// @ts-expect-error Legacy Widget API намеренно не входит в публичный type surface.
widget.auth;
// @ts-expect-error Устаревший синхронный Checkout API намеренно не поддерживается.
checkout.createCryptogramPacket;
// @ts-expect-error Устаревший positional-конструктор Checkout намеренно не поддерживается.
new CheckoutClass("pk_test");
// @ts-expect-error Checkout принимает HTMLElement, а не CSS selector.
new CheckoutClass({ publicId: "pk_test", container: "#payment-form" });

const validationErrors: CheckoutValidationErrors = { cardNumber: "CardNumber_Invalid" };
const dolyameRequest: DolyameCreatePaymentLinkRequest = {
	PublicId: "pk_test",
	AltPayType: "TcsBnplDolyame",
	Amount: 1_000,
	Scheme: "1",
};
void [validationErrors, dolyameRequest];
