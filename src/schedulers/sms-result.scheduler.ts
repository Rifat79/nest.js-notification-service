import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from 'src/common/redis/redis.service';
import { SmsLogsCreateManyInput } from 'src/database/sms-log.repository';
import { SMS_RESULTS_REDIS_KEY } from 'src/notification/notification.service';
import { SmsNotificationResult, SmsService } from 'src/sms/sms.service';

@Injectable()
export class SMSResultSchedular {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly smsService: SmsService,
  ) {
    this.logger.setContext(SMSResultSchedular.name);
  }

  /**
   * Transforms the raw Redis result object into the format required for
   * batch database insertion.
   * @param serializedResult The parsed SMS notification result.
   * @returns An object conforming to SmsLogsCreateManyInput.
   */
  private transformResultToLog(
    serializedResult: SmsNotificationResult,
  ): SmsLogsCreateManyInput {
    return {
      msisdn: serializedResult.msisdn,
      message: serializedResult.messageBody,
      message_type: serializedResult.messageType,
      related_subscription_id: serializedResult.subscriptionId,
      http_method: serializedResult.method,
      request_url: serializedResult.url,
      request_payload: serializedResult.requestPayload,
      request_headers: serializedResult.requestHeaders,
      status: serializedResult.responseStatus.toString(),
      error_code: serializedResult.errorCode,
      error_message: serializedResult.errorMessage,
      provider: serializedResult.provider,
      provider_response: serializedResult.response,
      // Convert ISO strings to Date objects for database insertion
      sent_at: serializedResult.sentAt
        ? new Date(serializedResult.sentAt)
        : null,
      delivered_at: serializedResult.deliveredAt
        ? new Date(serializedResult.deliveredAt)
        : null,
    };
  }

  @Cron(CronExpression.EVERY_30_SECONDS, {
    name: 'scheduled_sms_results',
  })
  async processSmsResults() {
    this.logger.info(`✅ Starting scheduled job: scheduled_sms_results`);
    const startTime = Date.now();
    const smsLogsBatch: SmsLogsCreateManyInput[] = [];
    let recordsProcessed = 0;
    const MAX_BATCH_SIZE = this.configService.get<number>(
      'batch.smsResultSchedularBatchSize',
      1000,
    );

    // --- 1. Data Retrieval and Transformation Loop ---
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const result = await this.redis.lpop(SMS_RESULTS_REDIS_KEY);

      // Stop if the Redis list is empty
      if (!result) {
        break;
      }

      try {
        const serializedResult: SmsNotificationResult = JSON.parse(result);
        const row = this.transformResultToLog(serializedResult);
        smsLogsBatch.push(row);
        recordsProcessed++;
      } catch (parseError) {
        // Log critical parsing errors. The corrupted item is permanently removed via lpop.
        this.logger.error(
          {
            error: parseError,
            rawRedisValue: result,
          },
          'Failed to parse SMS notification result from Redis. Item skipped.',
        );
      }
    }

    // Exit early if nothing was retrieved
    if (smsLogsBatch.length === 0) {
      this.logger.info(
        '🛑 No new SMS results found in Redis queue. Exiting scheduler.',
      );
      return;
    }

    // --- 2. Database Persistence with Robust Error Handling ---
    try {
      this.logger.info(
        `Attempting to persist ${smsLogsBatch.length} SMS log records in a batch.`,
      );

      // The smsService should handle an efficient bulk insert (e.g., using Prisma's createMany)
      await this.smsService.recordSmsLogs(smsLogsBatch);

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          processedCount: recordsProcessed,
          durationMs: duration,
        },
        `🎉 Successfully finished scheduled_sms_results. Processed ${recordsProcessed} records in ${duration}ms.`,
      );
    } catch (dbError) {
      // Log critical database errors. This is a severe error as a batch of items
      // were successfully retrieved from Redis but failed to save.
      this.logger.error(
        {
          error: dbError,
          batchSize: smsLogsBatch.length,
          // Optional: Log the first few items that failed to save for debugging
          // failedBatchSample: smsLogsBatch.slice(0, 5)
        },
        '❌ CRITICAL: Failed to record SMS logs in the database. Data might be lost/missed. Check database connection and integrity!',
      );
    }
  }
}
