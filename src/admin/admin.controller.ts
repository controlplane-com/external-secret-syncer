import { Controller, Post } from '@nestjs/common';
import { CleanupService } from 'src/sync/cleanup';

@Controller()
export class AdminController {
  constructor(private cleanupService: CleanupService) {}

  @Post('-cleanUp')
  async cleanUp() {
    await this.cleanupService.cleanupAllSecrets();
  }
}
