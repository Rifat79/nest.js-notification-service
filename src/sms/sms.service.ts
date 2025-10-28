import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  NotificationEventType,
  NotificationPayload,
  PaymentProvider,
} from 'src/notification/notification.service';
import { GpSmsSender, SMSSenderResponse } from './senders/gp.sms-sender';
import { SmsTemplateService } from './sms-template.service';

// --- Type Definitions (Re-used/Simplified) ---

export interface SmsNotificationResult extends SMSSenderResponse {
  subscriptionId: string;
  messageType: NotificationEventType;
  messageBody: string;
  provider: PaymentProvider;
}

export class SmsConfigurationError extends Error {
  constructor(provider: PaymentProvider) {
    super(`Sms sender is not configured for payment provider: ${provider}`);
    this.name = 'SmsConfigurationError';
  }
}

// --- Main Service ---

@Injectable()
export class SmsService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly gpSender: GpSmsSender,
    private readonly templateService: SmsTemplateService,
  ) {
    this.logger.setContext(SmsService.name);
  }

  /**
   * Sends an SMS notification and is designed to be called from a BullMQ worker.
   * Logs errors but re-throws them to ensure BullMQ can retry the job.
   *
   * @param payload The notification details including msisdn, eventType, provider, etc.
   * @returns A promise that resolves to the notification response object on success.
   * @throws Error on any failure (configuration, template, network, etc.) for BullMQ retry.
   */
  async sendNotificationSms(
    payload: NotificationPayload,
  ): Promise<SmsNotificationResult> {
    const { msisdn, eventType, paymentProvider, subscriptionId, amount } =
      payload;

    try {
      // 1. Template Generation
      const template = this.templateService.getTemplate(
        eventType,
        paymentProvider,
      );

      // IMPORTANT: Use actual payload data
      const messageBody = this.templateService.populateTemplate(template, {
        amount: amount.toFixed(2), // Ensure amount is formatted
        subscriptionId: subscriptionId,
        // ...other dynamic values
      });

      let senderResult: SMSSenderResponse;
      const provider: PaymentProvider = paymentProvider;

      // 2. Sender Selection and Execution
      switch (provider) {
        case 'GP':
          senderResult = await this.gpSender.send(msisdn, messageBody);
          break;

        default:
          // Use a specific error for configuration issues
          throw new SmsConfigurationError(provider);
      }

      // 3. Response Construction and Return
      return {
        ...senderResult, // Copy sender's properties
        subscriptionId: subscriptionId,
        messageType: eventType,
        messageBody: messageBody,
        provider: provider,
      };
    } catch (error) {
      // 4. Critical for BullMQ: Log the failure and RE-THROW the error.
      // This ensures the BullMQ worker fails the job, allowing for automatic retries.
      this.logger.error(
        { payload, error },
        `SMS notification failed for subscription ${subscriptionId} (${paymentProvider}).`,
      );

      // Re-throw the error so the BullMQ worker process marks the job as failed/retryable.
      throw error;
    }
  }
}
