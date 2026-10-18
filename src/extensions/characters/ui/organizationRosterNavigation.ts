import type { RosterOrganization } from "../roster/types";

/** Follow stable parent links rather than inferring hierarchy from display names. */
export function organizationPath(organizations: RosterOrganization[], id?: string): RosterOrganization[] {
  const byId = new Map(organizations.map(organization => [organization.id, organization]));
  const path: RosterOrganization[] = [];
  const visited = new Set<string>();
  while (id && !visited.has(id)) {
    visited.add(id);
    const organization = byId.get(id);
    if (!organization) break;
    path.unshift(organization);
    id = organization.parentId;
  }
  return path;
}

/** Settlement nodes have canonical burg ids; institutions can also have burg locations. */
export function groupOrganizations(organizations: RosterOrganization[], parentId?: string, locale = "en") {
  const groups = ["countries", "institutions", "territories", "settlements"] as const;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const children = organizations.filter(organization => organization.parentId === parentId && !organization.archived);
  const kind = (organization: RosterOrganization) =>
    /^state:\d+$/.test(organization.id)
      ? "countries"
      : /^burg:\d+$/.test(organization.id)
        ? "settlements"
        : /^(holding|province):/.test(organization.id)
          ? "territories"
          : "institutions";
  return groups
    .map(group => ({
      kind: group,
      organizations: children
        .filter(organization => kind(organization) === group)
        .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
    }))
    .filter(group => group.organizations.length > 0);
}
