import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { RabbitMQConsumerService } from 'src/common/rabbitmq/rabbitmq.service';
import { RedisService } from 'src/common/redis/redis.service';
import { SmsNotificationResult } from 'src/sms/sms.service';
import { WebhookNotificationResult } from 'src/webhook/webhook.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_QUEUES,
} from './notification.constants';

export const SMS_RESULTS_REDIS_KEY = 'notification_sms_results';
export const WEBHOOK_RESULTS_REDIS_KEY = 'notification_webhook_results';

export type NotificationEventType =
  | 'renew.success'
  | 'renew.fail'
  | 'subscription.success'
  | 'subscription.fail'
  | 'subscription.cancel'
  | 'unsubscription.success'
  | 'unsubscription.fail'
  | 'pre.renewal.alert';

export type PaymentProvider = 'GP' | 'BL' | 'ROBI' | 'ROBI_MIFE';

export interface NotificationPayload {
  id: string;
  source: 'dcb-renewal-service' | 'dcb-billing-service';
  subscriptionId: string;
  merchantTransactionId: string;
  keyword: string;
  msisdn: string;
  paymentProvider: PaymentProvider;
  eventType: NotificationEventType;
  amount: number;
  currency: string;
  billingCycleDays: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

// Define a Configuration Map for Queue Actions
// The key is the event type, and the value is an array of queues/actions to perform.
// 'sms' and 'webhook' represent the action/queue to target.
const NOTIFICATION_ACTIONS_MAP: Record<
  NotificationEventType,
  Array<'sms' | 'webhook' | 'sms_conditional'>
> = {
  'renew.success': ['sms_conditional', 'webhook'], // Special case for SMS condition
  'renew.fail': ['webhook'],
  'subscription.success': ['sms', 'webhook'],
  'subscription.fail': ['webhook'],
  'subscription.cancel': ['webhook'],
  'unsubscription.success': ['sms', 'webhook'],
  'unsubscription.fail': [], // Explicitly no actions
  'pre.renewal.alert': ['sms'],
};

@Injectable()
export class NotificationService implements OnModuleInit {
  constructor(
    @InjectQueue(NOTIFICATION_QUEUES.SMS)
    private readonly smsQueue: Queue<NotificationPayload>,
    @InjectQueue(NOTIFICATION_QUEUES.WEBHOOK)
    private readonly webhookQueue: Queue<NotificationPayload>,
    private readonly rabbitmqConsumer: RabbitMQConsumerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    // Subscribe to both queues
    await this.startConsumingFromBillingService();
    await this.startConsumingFromRenewalService();
  }

  /**
   * Subscribe to subscription notifications queue
   */
  private async startConsumingFromBillingService() {
    const queueName = this.configService.get<string>(
      'rmq.queues.subscriptions',
      '#',
    );

    this.logger.info(
      `Starting to consume from subscriptions queue: ${queueName}`,
    );

    try {
      await this.rabbitmqConsumer.consume(
        queueName,
        this.processNotification.bind(this, queueName),
      );
    } catch (error) {
      this.logger.error(`Failed to start consuming from ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to renewal notifications queue
   */
  private async startConsumingFromRenewalService() {
    const queueName = this.configService.get<string>(
      'rmq.queues.renewals',
      '#',
    );

    this.logger.info(`Starting to consume from renewals queue: ${queueName}`);

    try {
      await this.rabbitmqConsumer.consume(
        queueName,
        this.processNotification.bind(this, queueName),
      );
    } catch (error) {
      this.logger.error(`Failed to start consuming from ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Main notification processing logic
   */

  private getJobOptions(
    eventType: NotificationEventType,
    subscriptionId: string,
  ) {
    return {
      jobId: subscriptionId,
      removeOnComplete: true,
      removeOnFail: false,
      priority: NOTIFICATION_PRIORITY[eventType] ?? 10,
    };
  }

  private async processNotification(
    source: string,
    notification: NotificationPayload,
  ): Promise<void> {
    this.logger.info(
      `[${source}] Processing notification: ${notification.id}, ` +
        `event: ${notification.eventType}, msisdn: ${notification.msisdn}`,
    );

    try {
      const { eventType, subscriptionId } = notification;
      const actions = NOTIFICATION_ACTIONS_MAP[eventType];

      if (!actions) {
        this.logger.warn(
          { eventType, subscriptionId },
          'Unhandled notification event type or no actions defined',
        );
        return;
      }

      const jobs: Promise<Job<any, any, string>>[] = [];
      const smsJobName = 'sms-notification';
      const webhookJobName = 'webhook-notification';
      const jobOptions = this.getJobOptions(eventType, subscriptionId);

      for (const action of actions) {
        switch (action) {
          case 'sms':
            jobs.push(this.smsQueue.add(smsJobName, notification, jobOptions));
            break;

          case 'webhook':
            jobs.push(
              this.webhookQueue.add(webhookJobName, notification, jobOptions),
            );
            break;

          case 'sms_conditional':
            // The specific 'renew.success' logic is now isolated here
            if (notification.billingCycleDays > 7) {
              jobs.push(
                this.smsQueue.add(smsJobName, notification, jobOptions),
              );
            }
            break;

          default:
            // Should not happen, but good for type safety/future-proofing
            this.logger.error(`Unknown action '${action}' encountered.`);
        }
      }

      await Promise.allSettled(jobs);
    } catch (error) {
      this.logger.error(
        `Error processing notification ${notification.id}`,
        error,
      );
      throw error;
    }
  }

  async publishSmsNotificationResult(
    result: SmsNotificationResult,
  ): Promise<void> {
    await this.redis.rpush(SMS_RESULTS_REDIS_KEY, JSON.stringify(result));

    this.logger.info({
      msg: 'Published sms sending results',
      subscriptionId: result.subscriptionId,
    });
  }

  async publishWebhookNotificationResult(
    result: WebhookNotificationResult | null,
  ): Promise<void> {
    if (!result) {
      this.logger.warn('result was found null');
      return;
    }

    await this.redis.rpush(WEBHOOK_RESULTS_REDIS_KEY, JSON.stringify(result));

    this.logger.info({
      msg: 'Published webhook sending results',
      subscriptionId: result.subscriptionId,
    });
  }

  async processDLQMessages(
    queueType: 'subscriptions' | 'renewals',
  ): Promise<{ processed: number; errors: string[] }> {
    const dlqName = this.configService.get<string>(
      `rmq.queues.${queueType}Dlq`,
      '#',
    );

    this.logger.info(
      `Starting DLQ processing for ${queueType} from: ${dlqName}`,
    );

    const errors: string[] = [];
    let processed = 0;

    try {
      await this.rabbitmqConsumer.consume(dlqName, async (message: any) => {
        try {
          this.logger.warn(`DLQ Message (${queueType}): ${message.id}`);
          await this.logDLQMessage(message, queueType);
          processed++;
        } catch (error) {
          const errorMsg = `Failed to process DLQ message ${message.id}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      });
    } catch (error) {
      this.logger.error(`Failed to start DLQ consumer for ${queueType}`, error);
      errors.push(`DLQ consumer error: ${error.message}`);
    }

    return { processed, errors };
  }

  private async logDLQMessage(message: any, queueType: string): Promise<void> {
    this.logger.error(`Message in DLQ (${queueType}):`, {
      id: message.id,
      type: message.type,
      recipient: message.recipient,
      timestamp: message.timestamp,
      metadata: message.metadata,
    });

    // Production: Store in database and send alerts
    /*
    await this.database.dlqMessages.create({
      messageId: message.id,
      queueType,
      payload: JSON.stringify(message),
      failedAt: new Date(),
    });

    await this.alertService.send({
      level: 'error',
      title: `DLQ Message - ${queueType}`,
      message: `Message ${message.id} failed after all retries`,
    });
    */
  }
}
