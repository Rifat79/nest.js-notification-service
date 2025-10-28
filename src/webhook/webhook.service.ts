import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HttpClientService } from 'src/common/http-client/http-client.service';
import {
  MerchantNotificationRepository,
  MerchantNotificationsCreateManyInput,
} from 'src/database/merchant-notification.repository';
import {
  NotificationEventType,
  NotificationPayload,
} from 'src/notification/notification.service';
import {
  ProductService,
  WebhookConfigResult,
} from 'src/product/product.service';

// Result structure defined in the original code, kept for consistency
export interface WebhookNotificationResult {
  merchantId: number;
  productId: number;
  url: string;
  eventType: NotificationEventType;
  method: 'GET' | 'POST';
  headers: Record<string, any>;
  payload: Record<string, any>; // The original NotificationPayload
  subscriptionId: string;
  sentAt: number;
  responseStatus: number;
  responseBody: string | null | undefined; // Could be a body object or an error string
  duration: number;
  deliveryStatus: 'delivered' | 'failed' | 'timeout';
  failedAt: number | null;
  errorMessage?: string | null;
}

// Define the structure for the request body/query parameters
interface WebhookRequestParams {
  msisdn: string;
  shortcode: string;
  operator: string;
  billing_id: string;
  tariff: number;
  event: 'subscription' | 'unsubscription' | 'rebill' | 'unknown';
  status: string;
  order_tracking_id: string;
  reason: string; // Initially empty, but kept for consistency
  subscription_lifecycle: 'Ended' | 'Remaining';
}

@Injectable()
export class WebhookService {
  // Define a default timeout constant for clarity and reusability
  private static readonly DEFAULT_TIMEOUT_MS = 5000;

  constructor(
    private readonly logger: PinoLogger,
    private readonly productService: ProductService,
    private readonly httpClient: HttpClientService,
    private readonly merchantNotificationRepo: MerchantNotificationRepository,
  ) {
    this.logger.setContext(WebhookService.name);
  }

  /**
   * Helper function to map the eventType to a standard webhook 'event' field.
   * @param eventType - The NotificationEventType from the payload.
   */
  private mapEventTypeToWebhookEvent(
    eventType: NotificationEventType,
  ): WebhookRequestParams['event'] {
    const primaryEvent = eventType.split('.')[0];
    switch (primaryEvent) {
      case 'subscription':
        return 'subscription';
      case 'unsubscription':
        return 'unsubscription';
      case 'renew':
        return 'rebill';
      default:
        // Log an unknown event type for investigation
        this.logger.warn(
          { eventType },
          'Received unknown primary event type for webhook mapping.',
        );
        return 'unknown';
    }
  }

  /**
   * Prepares the parameters for the webhook request based on the notification payload.
   * @param payload - The original notification payload.
   */
  private prepareRequestParams(
    payload: NotificationPayload,
  ): WebhookRequestParams {
    const event = this.mapEventTypeToWebhookEvent(payload.eventType);
    const status = payload.eventType.split('.')[1] || ''; // Safely get status

    return {
      msisdn: payload.msisdn,
      shortcode: payload.keyword,
      operator: payload.paymentProvider,
      billing_id: payload.merchantTransactionId,
      tariff: payload.amount,
      event: event,
      status: status,
      order_tracking_id: payload.subscriptionId,
      reason: '', // Assuming this is deliberately empty as per original code
      subscription_lifecycle:
        payload.eventType === 'unsubscription.success' ? 'Ended' : 'Remaining',
    };
  }

  /**
   * Generates Basic Auth headers and includes necessary defaults like Content-Type and Timeout.
   * @param username - The Basic Auth username.
   * @param password - The Basic Auth password.
   * @param timeout - The request timeout in milliseconds.
   */
  private getAuthHeaders(
    username: string,
    password?: string,
    timeout: number = WebhookService.DEFAULT_TIMEOUT_MS,
  ): Record<string, any> {
    const credentials = `${username}:${password || ''}`;
    const encoded = Buffer.from(credentials).toString('base64');

    // Return the full header and config object used by the httpClient
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
      // Include timeout at the top level if your httpClient supports it this way
      timeout: timeout,
    };
  }

  /**
   * Main function to send the webhook notification.
   * Includes robust error handling, detailed logging, and proper result formation.
   * @param payload - The data to be sent.
   */
  async sendWebhookNotification(
    payload: NotificationPayload,
  ): Promise<WebhookNotificationResult | null> {
    const { keyword, eventType, subscriptionId } = payload;
    let config: WebhookConfigResult;
    const sentAt = Date.now();
    let requestHeaders: Record<string, any> = {};
    let requestParams: WebhookRequestParams;

    this.logger.info(
      { subscriptionId, eventType },
      'Attempting to send webhook notification.',
    );

    // --- 1. Fetch Configuration and Prepare Parameters ---
    try {
      config = await this.productService.getWebhookConfig(keyword, eventType);
      requestParams = this.prepareRequestParams(payload);

      // Prepare headers, including auth and timeout
      if (config.hasAuth) {
        // Use a configured timeout if available, otherwise use default
        const timeout = WebhookService.DEFAULT_TIMEOUT_MS;
        requestHeaders = this.getAuthHeaders(
          config.auth_user!,
          config.auth_password,
          timeout,
        );
      }
    } catch (error) {
      // Log the failure to fetch config (e.g., config not found) and stop.
      this.logger.error(
        { subscriptionId, keyword, eventType, error: error.message },
        'Failed to get webhook configuration.',
      );
      // Return null or throw a specific error if webhook delivery is critical
      return null;
    }

    // --- 2. Execute HTTP Request ---
    const queryString = new URLSearchParams(
      requestParams as Record<string, any>,
    ).toString();
    const finalUrl =
      config.method === 'GET' ? `${config.url}?${queryString}` : config.url;

    const response =
      config.method === 'POST'
        ? await this.httpClient.post(config.url, requestParams, requestHeaders)
        : await this.httpClient.get(finalUrl);

    // --- 3. Final Result Formatting and Logging ---
    const duration = response.duration;
    const isSuccess = response.status >= 200 && response.status < 300;

    // Determine the delivery status
    let deliveryStatus: WebhookNotificationResult['deliveryStatus'];
    if (response.error?.code === 'ECONNABORTED') {
      deliveryStatus = 'timeout';
    } else if (isSuccess) {
      deliveryStatus = 'delivered';
    } else {
      deliveryStatus = 'failed';
    }

    const result: WebhookNotificationResult = {
      merchantId: config.merchantId,
      productId: config.productId,
      url: finalUrl,
      eventType: payload.eventType,
      method: config.method,
      headers: requestHeaders,
      payload: payload as Record<string, any>,
      subscriptionId: subscriptionId,
      sentAt,
      responseStatus: response.status || 0,
      responseBody: response.data ?? response.error ?? 'No response body/error',
      duration,
      deliveryStatus: deliveryStatus,
      failedAt: !isSuccess ? Date.now() : null,
      errorMessage: response.error?.message,
    };

    // Detailed logging for success or failure
    if (isSuccess) {
      this.logger.info(
        { ...result, duration },
        'Webhook successfully delivered.',
      );
    } else {
      this.logger.warn(
        { ...result, duration },
        `Webhook delivery failed with status ${result.responseStatus} and status: ${deliveryStatus}.`,
      );
    }

    return result;
  }

  async recordWebhookNotifications(
    batch: MerchantNotificationsCreateManyInput[],
  ): Promise<void> {
    return await this.merchantNotificationRepo.createMany(batch);
  }
}
