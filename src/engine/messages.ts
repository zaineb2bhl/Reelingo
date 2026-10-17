import type { MessageKey } from '@/i18n/en';
import type { DocumentErrorCode } from './reader';

export const DOCUMENT_ERROR_KEYS: Record<DocumentErrorCode, MessageKey> = {
  badType: 'series.errType',
  tooLarge: 'series.errTooLarge',
  tooLong: 'series.errTooLong',
  empty: 'series.errEmpty',
  unreadable: 'series.errUnreadable',
};
