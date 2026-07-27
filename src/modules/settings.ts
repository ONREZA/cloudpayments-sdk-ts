/**
 * Модуль settings — настройки уведомлений в ЛК.
 *
 * Эндпоинты с плейсхолдером {Type} в URL — нужно подставить NotificationType.
 */

import type { SettingsUpdateNotificationRequest } from "../_generated/endpoints.js";
import {
	SETTINGS_GET_NOTIFICATION_URL,
	SETTINGS_UPDATE_NOTIFICATION_URL,
} from "../_generated/endpoints.js";
import type { NotificationType } from "../_generated/handbooks.js";
import { BaseModule, type ExecOptions } from "./base.js";

export interface NotificationSetting {
	IsEnabled: boolean;
	Address: string;
	HttpMethod: "GET" | "POST";
	Encoding: "UTF8" | "Windows1251";
	Format: "CloudPayments" | "QIWI" | "RT";
}

export class SettingsModule extends BaseModule {
	/** Получить настройки выбранного типа уведомления. */
	getNotification(type: NotificationType, opts?: ExecOptions): Promise<NotificationSetting> {
		return this.exec<Record<string, never>, NotificationSetting>(
			SETTINGS_GET_NOTIFICATION_URL.replace("{Type}", type),
			{},
			opts,
			{ replaySafety: "safe" },
		);
	}

	/** Изменить настройки уведомления. */
	updateNotification(
		type: Exclude<NotificationType, "Check">,
		body: Omit<SettingsUpdateNotificationRequest, "Type">,
		opts?: ExecOptions,
	): Promise<void> {
		return this.exec<Omit<SettingsUpdateNotificationRequest, "Type">, void>(
			SETTINGS_UPDATE_NOTIFICATION_URL.replace("{Type}", type),
			body,
			opts,
		);
	}
}
