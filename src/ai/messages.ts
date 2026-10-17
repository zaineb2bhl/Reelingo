import type { MessageKey } from '@/i18n/en';
import type { DocumentErrorCode } from './document';
import type { AiErrorKind } from './generate';

/** UI message for each AI failure kind. */
export const AI_ERROR_KEYS: Record<AiErrorKind, MessageKey> = {
  noKey: 'ai.errNoKey',
  auth: 'ai.errAuth',
  rateLimit: 'ai.errRateLimit',
  overloaded: 'ai.errOverloaded',
  network: 'ai.errNetwork',
  refusal: 'ai.errRefusal',
  invalid: 'ai.errInvalid',
  unknown: 'ai.errUnknown',
};

export const DOCUMENT_ERROR_KEYS: Record<DocumentErrorCode, MessageKey> = {
  badType: 'series.errType',
  tooLarge: 'series.errTooLarge',
  tooLong: 'series.errTooLong',
  empty: 'series.errEmpty',
  unreadable: 'series.errUnreadable',
};
