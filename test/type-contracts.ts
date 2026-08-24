import type {
	KktPaymentMethod,
	KktPaymentObject,
	KktReceiptDetailsItem,
	KktRussiaTimeZone,
	KktUnitCode,
	NotificationType,
	OrdersCreateRequest,
	PaymentsAuthTokenRequest,
	PaymentsChargeTokenRequest,
	PaymentsListByPeriodRequest,
	SettingsGetNotificationRequest,
	SettingsUpdateNotificationRequest,
	SubscriptionsCreateRequest,
	SubscriptionsUpdateRequest,
} from "../src/index.js";
import type {
	FailNotificationPayload,
	RecurrentNotificationPayload,
} from "../src/webhooks/index.js";

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Expect<Value extends true> = Value;

type _NotificationHttpMethod = Expect<
	Equal<NonNullable<SettingsUpdateNotificationRequest["HttpMethod"]>, "GET" | "POST">
>;
type _NotificationEncoding = Expect<
	Equal<NonNullable<SettingsUpdateNotificationRequest["Encoding"]>, "UTF8" | "Windows1251">
>;
type _NotificationFormat = Expect<
	Equal<NonNullable<SettingsUpdateNotificationRequest["Format"]>, "CloudPayments" | "QIWI" | "RT">
>;
type _NotificationGetType = Expect<Equal<SettingsGetNotificationRequest["Type"], NotificationType>>;
type _NotificationUpdateType = Expect<
	Equal<SettingsUpdateNotificationRequest["Type"], Exclude<NotificationType, "Check">>
>;
type _ReceiptIsNotACloudPaymentsNotification = Expect<
	Equal<Extract<NotificationType, "Receipt">, never>
>;

type _ChargeTokenInitiator = Expect<Equal<PaymentsChargeTokenRequest["TrInitiatorCode"], 0 | 1>>;
type _AuthTokenScheduled = Expect<
	Equal<NonNullable<PaymentsAuthTokenRequest["PaymentScheduled"]>, 0 | 1>
>;
type _TransactionListStatuses = Expect<
	Equal<
		NonNullable<PaymentsListByPeriodRequest["Statuses"]>,
		Array<"Authorized" | "Completed" | "Cancelled" | "Declined">
	>
>;
type _CreateSubscriptionInterval = Expect<
	Equal<SubscriptionsCreateRequest["Interval"], "Day" | "Week" | "Month">
>;
type _UpdateSubscriptionInterval = Expect<
	Equal<NonNullable<SubscriptionsUpdateRequest["Interval"]>, "Day" | "Week" | "Month">
>;
type _OrderSubscriptionBehavior = Expect<
	Equal<NonNullable<OrdersCreateRequest["SubscriptionBehavior"]>, "CreateWeekly" | "CreateMonthly">
>;

type _FailReasonCode = Expect<
	Equal<FailNotificationPayload["ReasonCode"], import("../src/index.js").ReasonCode>
>;
type _RecurrentInterval = Expect<
	Equal<RecurrentNotificationPayload["Interval"], "Day" | "Week" | "Month">
>;
type _KktMethod = Expect<Equal<KktReceiptDetailsItem["Method"], KktPaymentMethod>>;
type _KktObject = Expect<Equal<KktReceiptDetailsItem["Object"], KktPaymentObject>>;
type _KktRussiaTimeZone = Expect<
	Equal<KktRussiaTimeZone, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11>
>;
type _KktUnitCode = Expect<
	Equal<
		KktUnitCode,
		| 0
		| 10
		| 11
		| 12
		| 20
		| 21
		| 22
		| 30
		| 31
		| 32
		| 40
		| 41
		| 42
		| 50
		| 51
		| 70
		| 71
		| 72
		| 73
		| 80
		| 81
		| 82
		| 83
		| 255
	>
>;
