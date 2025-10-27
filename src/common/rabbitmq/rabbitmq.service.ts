import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export interface MessageHandler {
  (message: any): Promise<void>;
}

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly logger = new Logger(RabbitMQConsumerService.name);
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000;
  private isConnecting = false;
  private messageHandlers: Map<string, MessageHandler> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const url = this.configService.get<string>('rmq.url');

      this.connection = await amqp.connect(url, {
        heartbeat: 60,
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn(
          'RabbitMQ connection closed. Attempting to reconnect...',
        );
        this.handleConnectionError();
      });

      this.channel = await this.connection.createChannel();

      const prefetchCount = this.configService.get<number>('rmq.prefetchCount');
      await this.channel.prefetch(prefetchCount);

      this.channel.on('error', (err) => {
        this.logger.error('RabbitMQ channel error:', err);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      // await this.setupQueuesAndExchanges();

      // Restart all consumers after reconnection
      await this.restartConsumers();

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.logger.log('Successfully connected to RabbitMQ');
    } catch (error) {
      this.isConnecting = false;
      this.logger.error('Failed to connect to RabbitMQ:', error);
      await this.handleConnectionError();
    }
  }

  private async handleConnectionError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.logger.log(
        `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
      );

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      this.logger.error(
        'Max reconnection attempts reached. Manual intervention required.',
      );
    }
  }

  // private async setupQueuesAndExchanges() {
  //   // Setup Subscriptions Queue and DLQ
  //   await this.setupQueueWithDLQ(
  //     'subscriptions',
  //     this.configService.get<string>('rmq.queues.subscriptions', '#'),
  //     this.configService.get<string>('rmq.queues.subscriptionsDlq', '#'),
  //     this.configService.get<string>('rmq.exchanges.subscriptions', '#'),
  //     this.configService.get<string>('rmq.exchanges.subscriptionsDlq', '#'),
  //     this.configService.get<string>('rmq.routingKeys.subscription', '#'),
  //     this.configService.get<string>('rmq.routingKeys.subscriptionDlq', '#'),
  //   );

  //   // Setup Renewals Queue and DLQ
  //   await this.setupQueueWithDLQ(
  //     'renewals',
  //     this.configService.get<string>('rmq.queues.renewals', '#'),
  //     this.configService.get<string>('rmq.queues.renewalsDlq', '#'),
  //     this.configService.get<string>('rmq.exchanges.renewals', '#'),
  //     this.configService.get<string>('rmq.exchanges.renewalsDlq', '#'),
  //     this.configService.get<string>('rmq.routingKeys.renewal', '#'),
  //     this.configService.get<string>('rmq.routingKeys.renewalDlq', '#'),
  //   );

  //   this.logger.log('RabbitMQ queues and exchanges set up successfully');
  // }

  // private async setupQueueWithDLQ(
  //   name: string,
  //   queueName: string,
  //   dlqName: string,
  //   exchangeName: string,
  //   dlqExchangeName: string,
  //   routingKey: string,
  //   dlqRoutingKey: string,
  // ) {
  //   // Assert DLQ exchange
  //   await this.channel.assertExchange(dlqExchangeName, 'topic', {
  //     durable: true,
  //   });

  //   // Assert main exchange
  //   await this.channel.assertExchange(exchangeName, 'topic', {
  //     durable: true,
  //   });

  //   // Assert DLQ
  //   await this.channel.assertQueue(dlqName, {
  //     durable: true,
  //     arguments: {
  //       'x-message-ttl': 86400000, // 24 hours
  //       'x-max-length': 10000,
  //     },
  //   });

  //   // Assert main queue with DLQ configuration
  //   await this.channel.assertQueue(queueName, {
  //     durable: true,
  //     arguments: {
  //       'x-dead-letter-exchange': dlqExchangeName,
  //       'x-dead-letter-routing-key': dlqRoutingKey,
  //       'x-max-length': 100000,
  //       'x-overflow': 'reject-publish',
  //     },
  //   });

  //   // Bind DLQ
  //   await this.channel.bindQueue(dlqName, dlqExchangeName, dlqRoutingKey);

  //   // Bind main queue
  //   await this.channel.bindQueue(queueName, exchangeName, routingKey);

  //   this.logger.log(`Setup complete for ${name} queue and DLQ`);
  // }

  async consume(queueName: string, handler: MessageHandler): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel is not available');
    }

    this.messageHandlers.set(queueName, handler);

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) {
          return;
        }

        const startTime = Date.now();
        let content: any;

        try {
          content = JSON.parse(msg.content.toString());
          const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
          const messageId = msg.properties.messageId || content.id || 'unknown';

          this.logger.log(
            `Processing message: ${messageId}, retry: ${retryCount}, queue: ${queueName}`,
          );

          await handler(content);

          this.channel.ack(msg);

          const processingTime = Date.now() - startTime;
          this.logger.log(
            `Message acknowledged: ${messageId}, processing time: ${processingTime}ms`,
          );
        } catch (error) {
          const messageId =
            msg.properties.messageId || content?.id || 'unknown';
          this.logger.error(`Error processing message: ${messageId}`, error);

          const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
          const maxRetries = this.configService.get<number>(
            'rmq.retryAttempts',
            3,
          );

          if (retryCount < maxRetries) {
            // Update retry count and requeue
            const updatedHeaders = {
              ...msg.properties.headers,
              'x-retry-count': retryCount + 1,
              'x-last-error': error.message,
              'x-last-retry-time': Date.now(),
            };

            this.channel.nack(msg, false, false);

            // Republish with updated headers
            this.channel.publish(
              msg.fields.exchange,
              msg.fields.routingKey,
              msg.content,
              {
                ...msg.properties,
                headers: updatedHeaders,
              },
            );

            this.logger.log(
              `Message requeued for retry: ${messageId}, attempt ${retryCount + 1}/${maxRetries}`,
            );
          } else {
            // Send to DLQ
            this.channel.nack(msg, false, false);
            this.logger.error(
              `Message sent to DLQ after ${maxRetries} retries: ${messageId}`,
            );
          }
        }
      },
      {
        noAck: false,
      },
    );

    this.logger.log(`Started consuming from queue: ${queueName}`);
  }

  private async restartConsumers(): Promise<void> {
    for (const [queueName, handler] of this.messageHandlers.entries()) {
      try {
        await this.consume(queueName, handler);
        this.logger.log(`Restarted consumer for queue: ${queueName}`);
      } catch (error) {
        this.logger.error(
          `Failed to restart consumer for queue: ${queueName}`,
          error,
        );
      }
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.logger.log('RabbitMQ channel closed');
      }

      if (this.connection) {
        await this.connection.close();
        this.logger.log('RabbitMQ connection closed');
      }
    } catch (error) {
      this.logger.error('Error during RabbitMQ disconnect', error);
    }
  }
}
