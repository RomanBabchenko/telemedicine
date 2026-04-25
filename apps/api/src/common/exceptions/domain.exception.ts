import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

interface DomainExceptionPayload {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

const payload = (input: DomainExceptionPayload) => ({
  message: input.message,
  code: input.code,
  ...(input.details ? { details: input.details } : {}),
});

/**
 * Thrown when a domain resource cannot be located. Propagates as HTTP 404
 * with a machine-readable `code` so frontends can distinguish "appointment
 * not found" from "patient not found" without string matching.
 */
export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, id?: string, details?: Record<string, unknown>) {
    super(
      payload({
        message: id ? `${resource} ${id} not found` : `${resource} not found`,
        code: `${resource.toLowerCase()}.not_found`,
        details: { resource, ...(id ? { id } : {}), ...(details ?? {}) },
      }),
    );
  }
}

/**
 * Thrown when a write would violate a uniqueness or existence precondition
 * (duplicate membership, slot already booked, idempotency replay mismatch).
 */
export class ResourceConflictException extends ConflictException {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(payload({ message, code, details }));
  }
}

/**
 * Thrown when a domain invariant is violated — the request was syntactically
 * valid but cannot be executed in the current state (e.g. cancelling an
 * already-completed appointment). Surfaces as HTTP 422 Unprocessable Entity.
 */
export class BusinessRuleViolationException extends UnprocessableEntityException {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(payload({ message, code, details }));
  }
}
