import { Injectable } from '@nestjs/common';
import { Prisma, merchant_notifications } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

export type MerchantNotificationsCreateManyInput =
  Prisma.merchant_notificationsCreateManyInput;

@Injectable()
export class MerchantNotificationRepository extends BaseRepository<
  merchant_notifications,
  Prisma.merchant_notificationsDelegate,
  Prisma.merchant_notificationsCreateInput,
  Prisma.merchant_notificationsUpdateInput,
  Prisma.merchant_notificationsWhereInput,
  Prisma.merchant_notificationsWhereUniqueInput
> {
  protected readonly modelName = 'merchant_notifications';

  constructor(prisma: PrismaService, logger: PinoLogger) {
    super(prisma, logger);
  }

  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.merchant_notificationsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.merchant_notifications;
  }

  /**
   * Performs a high-performance bulk insert using Prisma.createMany().
   * All rows are inserted in a single SQL query for maximum efficiency.
   */
  async createMany(
    data: MerchantNotificationsCreateManyInput[],
  ): Promise<void> {
    if (!data.length) return;
    try {
      await this.getDelegate().createMany({ data });
      this.logger.debug(
        { model: this.modelName, count: data.length },
        'Bulk createMany operation completed.',
      );
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Bulk createMany operation failed.',
      );
      throw error;
    }
  }
}
