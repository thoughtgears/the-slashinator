import {describe, it, expect} from 'vitest';
import {
  parseCloudEvent,
  extractProjectId,
} from '../../../src/services/eventParser.service';

describe('EventParser', () => {
  describe('parseCloudEvent', () => {
    it('should parse valid CloudEvent with base64-encoded message', () => {
      const budgetAlert = {
        budgetDisplayName: 'test-project-alert',
        costAmount: 100,
        costIntervalStart: '2024-01-01',
        budgetAmount: 50,
        budgetAmountType: 'SPECIFIED_AMOUNT',
        alertThresholdExceeded: 1,
        currencyCode: 'USD',
      };

      const eventData = {
        message: {
          data: Buffer.from(JSON.stringify(budgetAlert)).toString('base64'),
          messageId: '123',
          publishTime: '2024-01-01',
        },
        subscription: 'test',
      };

      const result = parseCloudEvent(eventData);
      expect(result).toEqual(budgetAlert);
    });

    it('should throw on invalid base64 data', () => {
      const eventData = {
        message: {
          data: 'not-base64!!!',
          messageId: '123',
          publishTime: '2024-01-01',
        },
        subscription: 'test',
      };

      expect(() => parseCloudEvent(eventData)).toThrow();
    });

    it('should throw on missing required fields', () => {
      const incompleteAlert = {
        budgetDisplayName: 'test',
        costAmount: 100,
        // Missing required fields
      };

      const eventData = {
        message: {
          data: Buffer.from(JSON.stringify(incompleteAlert)).toString('base64'),
          messageId: '123',
          publishTime: '2024-01-01',
        },
        subscription: 'test',
      };

      expect(() => parseCloudEvent(eventData)).toThrow();
    });

    it('should throw on invalid event structure', () => {
      const invalidEvent = {
        message: {
          // Missing data field
          messageId: '123',
        },
      };

      expect(() => parseCloudEvent(invalidEvent)).toThrow();
    });
  });

  describe('extractProjectId', () => {
    it('should extract project ID by removing -alert suffix', () => {
      expect(extractProjectId('my-project-alert')).toBe('my-project');
      expect(extractProjectId('test-123-alert')).toBe('test-123');
      expect(extractProjectId('prod-app-alert')).toBe('prod-app');
    });

    it('should handle edge cases', () => {
      expect(extractProjectId('project-alert')).toBe('project');
      expect(extractProjectId('a-alert')).toBe('a');
    });
  });
});
