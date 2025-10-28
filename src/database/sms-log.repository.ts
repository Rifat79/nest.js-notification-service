import { Injectable } from '@nestjs/common';
import { Prisma, sms_logs } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

export type SmsLogsCreateManyInput = Prisma.sms_logsCreateManyInput;

@Injectable()
export class SmsLogRepository extends BaseRepository<
  sms_logs,
  Prisma.sms_logsDelegate,
  Prisma.sms_logsCreateInput,
  Prisma.sms_logsUpdateInput,
  Prisma.sms_logsWhereInput,
  Prisma.sms_logsWhereUniqueInput
> {
  protected readonly modelName = 'sms_logs';

  constructor(prisma: PrismaService, logger: PinoLogger) {
    super(prisma, logger);
  }

  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.sms_logsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.sms_logs;
  }

  /**
   * Performs a high-performance bulk insert using Prisma.createMany().
   * All rows are inserted in a single SQL query for maximum efficiency.
   */
  async createMany(data: SmsLogsCreateManyInput[]): Promise<void> {
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
