import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RabbitMQModule } from 'src/common/rabbitmq/rabbitmq.module';
import { ProductModule } from 'src/product/product.module';
import { NOTIFICATION_QUEUES } from './notification.constants';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    ProductModule,
    RabbitMQModule,
    BullModule.registerQueue(
      {
        name: NOTIFICATION_QUEUES.SMS,
      },
      {
        name: NOTIFICATION_QUEUES.WEBHOOK,
      },
    ),
  ],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
