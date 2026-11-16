import { readFileSync } from "node:fs";
import { dataDirectory } from "./dataset.ts";
import { InputError } from "./schema.ts";
import type { TariffSnapshot } from "./tariffs.ts";

interface WcoReference {
  id: string;
  authority: string;
  title: string;
  url: string;
  role: string;
  referenceDate?: string;
  sha256?: string;
  termsUrl?: string;
}
interface WcoMember {
  memberId: string;
  iso2: string | null;
  name: string;
  nameJa: string;
  kind: "country_or_territory" | "customs_territory";
  joinedOn: string;
  mofRosterNumber: number;
}
interface WcoAffiliate {
  memberId: "EU";
  iso2: null;
  name: string;
  nameJa: string;
  kind: "customs_union";
  status: "akin_to_wco_membership";
  joinedOn: null;
  countsAsMember: false;
}
interface WcoRegistry {
  schemaVersion: number;
  checkedOn: string;
  memberCount: number;
  sources: WcoReference[];
  members: WcoMember[];
  affiliates: WcoAffiliate[];
}

export interface OfficialCustomsSource {
  url: string;
  authority: string;
  title: string;
  kind: string;
  scope: string;
  sourceUrl?: string;
  checkedOn?: string;
}
interface SourceDirectory {
  title: string;
  url: string;
  publishedOn?: string;
}
interface SourceRegistry {
  schemaVersion: number;
  checkedOn: string;
  sourceDirectories: SourceDirectory[];
  sources: Record<string, OfficialCustomsSource[]>;
}
type CustomsParticipant = WcoMember | WcoAffiliate;

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function validLink(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}

function read<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, dataDirectory), "utf8")) as T;
}

export function loadWcoRegistry() {
  const roster = read<WcoRegistry>("wco-members.json");
  const links = read<SourceRegistry>("wco-tariff-sources.json");
  const memberIds = new Set(roster.members.map(({ memberId }) => memberId));
  if (
    roster.schemaVersion !== 1 ||
    roster.memberCount !== 187 ||
    roster.members.length !== roster.memberCount ||
    memberIds.size !== roster.memberCount ||
    !isDate(roster.checkedOn) ||
    roster.affiliates.length !== 1 ||
    roster.affiliates[0]?.memberId !== "EU" ||
    roster.affiliates[0]?.countsAsMember !== false ||
    memberIds.has("EU") ||
    roster.members.some(
      (member) =>
        !/^[A-Z]{2}$/.test(member.memberId) ||
        (member.memberId === "XK" ? member.iso2 !== null : member.iso2 !== member.memberId) ||
        !isDate(member.joinedOn),
    ) ||
    roster.sources.some((source) => !validLink(source.url))
  )
    throw new Error("INVALID_WCO_ROSTER");
  if (
    links.schemaVersion !== 1 ||
    !isDate(links.checkedOn) ||
    links.sourceDirectories.some((source) => !validLink(source.url)) ||
    Object.entries(links.sources).some(
      ([id, sources]) =>
        !(memberIds.has(id) || id === "EU") ||
        !Array.isArray(sources) ||
        sources.length === 0 ||
        new Set(sources.map(({ url }) => url)).size !== sources.length ||
        sources.some(
          (source) =>
            !validLink(source.url) ||
            (source.sourceUrl !== undefined && !validLink(source.sourceUrl)) ||
            (source.checkedOn !== undefined && !isDate(source.checkedOn)) ||
            !source.authority ||
            !source.title ||
            !source.kind ||
            !source.scope,
        ),
    )
  )
    throw new Error("INVALID_WCO_SOURCE_REGISTRY");
  return { roster, links };
}

export function describeTariffCoverage(
  snapshots: readonly TariffSnapshot[],
  destination: string,
  date: string,
  officialSources: readonly OfficialCustomsSource[],
) {
  const sources = snapshots.filter((snapshot) =>
    destination === "EU"
      ? snapshot.jurisdiction === "EU"
      : snapshot.countries.includes(destination),
  );
  const standard = sources.filter((source) => !source.role && source.zone === "standard");
  const inDate = (source: TariffSnapshot) =>
    source.availableFrom <= date && date <= source.availableThrough;
  const current = standard.filter(inDate);
  const currentMeasures = sources.filter((source) => source.role === "measures" && inDate(source));
  const status = current.length
    ? "tariff_reference_on_date"
    : standard.length
      ? "tariff_reference_other_date"
      : officialSources.length
        ? "official_sources_only"
        : "membership_only";
  return {
    status,
    lookupDestinations:
      destination === "EU"
        ? [...new Set(standard.flatMap((source) => source.countries))].sort()
        : [destination],
    officialSources,
    tariffReferences: standard.map((source) => ({
      snapshotId: source.id,
      scope: source.scope,
      sourceUrl: source.sourceUrl,
      from: source.availableFrom,
      through: source.availableThrough,
      onRequestedDate: inDate(source),
    })),
    measureSnapshotIdsOnDate: currentMeasures.map((source) => source.id),
    measureChargesOnDate: [
      ...new Set(currentMeasures.flatMap((source) => source.statistics.charges ?? [])),
    ].sort(),
  };
}

export function requireCoverageDate(date: string): void {
  if (!isDate(date))
    throw new InputError([{ path: "/date", code: "INVALID_DATE" }]);
}

export function wcoCoverage(
  registry: ReturnType<typeof loadWcoRegistry>,
  snapshots: readonly TariffSnapshot[],
  date: string,
) {
  requireCoverageDate(date);
  const entry = <T extends CustomsParticipant>(participant: T) => ({
    ...participant,
    membershipStatus: "countsAsMember" in participant ? participant.status : "member",
    ...describeTariffCoverage(
      snapshots,
      participant.memberId,
      date,
      registry.links.sources[participant.memberId] ?? [],
    ),
  });
  const members = registry.roster.members.map(entry);
  return {
    referenceDate: date,
    membershipCheckedOn: registry.roster.checkedOn,
    officialSourcesCheckedOn: registry.links.checkedOn,
    membershipSources: registry.roster.sources,
    officialSourceDirectories: registry.links.sourceDirectories,
    memberCount: registry.roster.memberCount,
    membersWithTariffReferences: members.filter((member) => member.tariffReferences.length).length,
    membersWithTariffReferencesOnDate: members.filter((member) => member.status === "tariff_reference_on_date").length,
    membersWithTariffReferencesOtherDatesOnly: members.filter((member) => member.status === "tariff_reference_other_date").length,
    membersWithOfficialSources: members.filter((member) => member.officialSources.length).length,
    membersWithOfficialSourcesOnly: members.filter((member) => member.status === "official_sources_only").length,
    membersWithMembershipOnly: members.filter((member) => member.status === "membership_only").length,
    membersWithImportMeasuresOnDate: members.filter((member) => member.measureSnapshotIdsOnDate.length).length,
    membersWithVatOrGstMeasurePacksOnDate: members.filter((member) =>
      member.measureChargesOnDate.some((charge) => charge === "import_vat" || charge === "import_gst"),
    ).length,
    allMemberTaxRatesComplete: false,
    members,
    affiliates: registry.roster.affiliates.map(entry),
  };
}

export type WcoCoverage = ReturnType<typeof wcoCoverage>;
