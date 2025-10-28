import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MerchantNotificationRepository } from './merchant-notification.repository';
import { PrismaBatchService } from './prisma-batch.service';
import { PrismaService } from './prisma.service';
import { ProductRepository } from './product.repository';
import { SmsLogRepository } from './sms-log.repository';
import { TransactionService } from './transaction.service';
export interface PrismaModuleOptions {
  isGlobal?: boolean;
  serviceName?: string;
}

@Global()
@Module({})
export class PrismaModule {
  static forRoot(options?: PrismaModuleOptions): DynamicModule {
    return {
      module: PrismaModule,
      global: options?.isGlobal ?? true,
      imports: [ConfigModule],
      providers: [
        PrismaService,
        // PrismaHealthIndicator,
        TransactionService,
        PrismaBatchService,
        {
          provide: 'SERVICE_NAME',
          useValue: options?.serviceName || 'dcb-renewal-service',
        },
        // Repositories
        ProductRepository,
        SmsLogRepository,
        MerchantNotificationRepository,
      ],
      exports: [
        PrismaService,
        // PrismaHealthIndicator,
        TransactionService,
        PrismaBatchService,
        // Repositories
        ProductRepository,
        SmsLogRepository,
        MerchantNotificationRepository,
      ],
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: PrismaModule,
      imports: [ConfigModule],
      providers: [
        PrismaService,
        TransactionService,
        PrismaBatchService,
        // Repositories
        ProductRepository,
        SmsLogRepository,
        MerchantNotificationRepository,
      ],
      exports: [
        PrismaService,
        TransactionService,
        PrismaBatchService,
        // Repositories
        ProductRepository,
        SmsLogRepository,
        MerchantNotificationRepository,
      ],
    };
  }
}
