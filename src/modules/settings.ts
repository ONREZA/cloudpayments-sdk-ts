/**
 * Модуль settings — настройки уведомлений в ЛК.
 *
 * Эндпоинты с плейсхолдером {Type} в URL — нужно подставить NotificationType.
 */

import type {
	SettingsGetNotificationRequest,
	SettingsUpdateNotificationRequest,
} from "../_generated/endpoints.js";
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
	Encoding: string;
	Format: "CloudPayments" | "Robokassa";
}

export class SettingsModule extends BaseModule {
	/** Получить настройки выбранного типа уведомления. */
	getNotification(
		type: NotificationType,
		body: SettingsGetNotificationRequest = {} as SettingsGetNotificationRequest,
		opts?: ExecOptions,
	): Promise<NotificationSetting> {
		return this.exec<SettingsGetNotificationRequest, NotificationSetting>(
			SETTINGS_GET_NOTIFICATION_URL.replace("{Type}", type),
			body,
			opts,
		);
	}

	/** Изменить настройки уведомления. */
	updateNotification(
		type: NotificationType,
		body: SettingsUpdateNotificationRequest,
		opts?: ExecOptions,
	): Promise<void> {
		return this.exec<SettingsUpdateNotificationRequest, void>(
			SETTINGS_UPDATE_NOTIFICATION_URL.replace("{Type}", type),
			body,
			opts,
		);
	}
}
