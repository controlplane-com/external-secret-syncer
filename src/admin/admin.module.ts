import { Module } from '@nestjs/common';
import { SyncModule } from 'src/sync/sync.module';

@Module({
  imports: [SyncModule],
})
export class AdminModule {}
