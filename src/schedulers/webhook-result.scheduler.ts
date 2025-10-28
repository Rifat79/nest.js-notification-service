import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from 'src/common/redis/redis.service';
import { MerchantNotificationsCreateManyInput } from 'src/database/merchant-notification.repository';
import { WEBHOOK_RESULTS_REDIS_KEY } from 'src/notification/notification.service';
import {
  WebhookNotificationResult,
  WebhookService,
} from 'src/webhook/webhook.service';

@Injectable()
export class WebhookResultScheduler {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly webhookService: WebhookService,
  ) {
    this.logger.setContext(WebhookResultScheduler.name);
  }

  private transformResultToLog(
    result: WebhookNotificationResult,
  ): MerchantNotificationsCreateManyInput {
    return {
      merchant_id: result.merchantId,
      product_id: result.productId,
      webhook_url: result.url,
      event_type: result.eventType,
      http_method: result.method,
      headers: result.headers,
      payload: result.payload,
      related_order_id: result.subscriptionId,
      sent_at: new Date(result.sentAt),
      failed_at: result.failedAt ? new Date(result.failedAt) : null,
      response_status_code: result.responseStatus,
      response_body: result.responseBody,
      response_time_ms: result.duration,
      delivery_status: result.deliveryStatus,
      error_message: result.errorMessage,
    };
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'scheduled_webhook_results' })
  async processWebhookResults() {
    const MAX_BATCH_SIZE = this.configService.get<number>(
      'batch.webhookResultSchedularBatchSize',
      1000,
    );

    const merchantNotificationBatch: MerchantNotificationsCreateManyInput[] =
      [];

    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const result = await this.redis.lpop(WEBHOOK_RESULTS_REDIS_KEY);
      if (!result) {
        break;
      }

      const serializedResult = JSON.parse(result) as WebhookNotificationResult;
      const row = this.transformResultToLog(serializedResult);
      merchantNotificationBatch.push(row);
    }

    if (merchantNotificationBatch.length === 0) {
      return;
    }

    await this.webhookService.recordWebhookNotifications(
      merchantNotificationBatch,
    );
  }
}
