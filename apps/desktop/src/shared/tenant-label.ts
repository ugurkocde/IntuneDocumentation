// Reports, baselines and documentation exports name the tenant by a
// shortened id only.
export function tenantLabelOf(tenantId: string | null | undefined): string | undefined {
  return tenantId ? `${tenantId.slice(0, 8)}...` : undefined;
}
