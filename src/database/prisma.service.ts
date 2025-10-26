import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from 'generated/prisma/client';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly serviceName: string;
  private prismaClient: PrismaClient;
  public client: PrismaClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly pinoLogger: PinoLogger,
  ) {
    this.serviceName = configService.get<string>(
      'app.serviceName',
      'dcb-renewal-service',
    );
    this.initializePrismaClient();
  }

  private initializePrismaClient() {
    const datasourceUrl = new URL(this.configService.get<string>('db.url')!);

    datasourceUrl.searchParams.set(
      'connection_limit',
      this.configService.get<string>('db.connectionLimit', '5'),
    );
    datasourceUrl.searchParams.set(
      'pool_timeout',
      this.configService.get<string>('db.poolTimeout', '20'),
    );
    datasourceUrl.searchParams.set(
      'connect_timeout',
      this.configService.get<string>('db.connectionTimeout', '10'),
    );
    datasourceUrl.searchParams.set(
      'statement_timeout',
      this.configService.get<string>('db.statementTimeout', '30000'),
    );

    if (this.configService.get<boolean>('USE_PGBOUNCER', false)) {
      datasourceUrl.searchParams.set('pgbouncer', 'true');
    }

    this.prismaClient = new PrismaClient({
      datasourceUrl: datasourceUrl.toString(),
      errorFormat: 'minimal',
    });

    this.client = this.prismaClient;
  }

  async onModuleInit() {
    try {
      await this.client.$connect();
      this.pinoLogger.info(
        { service: this.serviceName },
        'Database connection established successfully',
      );
    } catch (error) {
      this.pinoLogger.error(
        { service: this.serviceName, error },
        'Failed to connect to database',
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    this.pinoLogger.info(
      { service: this.serviceName },
      'Database connection closed',
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.pinoLogger.error(
        { service: this.serviceName, error },
        'Health check failed',
      );
      return false;
    }
  }

  async cleanConnection(): Promise<void> {
    await this.client.$disconnect();
    await this.client.$connect();
    this.pinoLogger.info(
      { service: this.serviceName },
      'Connection pool cleaned',
    );
  }

  async getMetrics() {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return {
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };
    } catch (error) {
      this.pinoLogger.error(
        { service: this.serviceName, error },
        'Failed to fetch metrics',
      );
      return {
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getRawClient(): PrismaClient {
    return this.prismaClient;
  }
}
