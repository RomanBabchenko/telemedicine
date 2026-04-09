import { Injectable, NotFoundException } from '@nestjs/common';
import { MisConnector } from '../domain/ports/mis-connector';
import { DocDreamStubConnector } from '../infrastructure/adapters/docdream-stub.connector';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, MisConnector>();

  constructor(stub: DocDreamStubConnector) {
    this.connectors.set(stub.id, stub);
  }

  get(connectorId: string): MisConnector {
    const c = this.connectors.get(connectorId);
    if (!c) throw new NotFoundException(`Connector "${connectorId}" not registered`);
    return c;
  }
}
