import { Test } from '@nestjs/testing';
import { Shortcuts } from './shortcuts';
import { ConfigModule } from './config.module';

describe('shortcuts', () => {
  let shortcuts: Shortcuts;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [Shortcuts],
    }).compile();

    shortcuts = moduleRef.get(Shortcuts);
  });

  it('should return correct short workload link', () => {
    expect(shortcuts.wokloadShortLink).toBe('/gvc/default/workload/ess');
  });
});
