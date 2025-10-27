import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import rmqConfig from 'src/config/rmq.config';
import { RabbitMQConsumerService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(rmqConfig)],
  providers: [RabbitMQConsumerService],
  exports: [RabbitMQConsumerService],
})
export class RabbitMQModule {}
