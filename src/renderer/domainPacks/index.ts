import type { DomainPack } from '../../shared/domainPackTypes';
import { adaptivePlantsPack } from './adaptivePlantsPack';
import { genomicMedicinePack } from './genomicMedicinePack';

export const bundledDomainPacks: DomainPack[] = [genomicMedicinePack, adaptivePlantsPack];

export function getDomainPackById(id: string): DomainPack | undefined {
  return bundledDomainPacks.find((pack) => pack.id === id);
}
