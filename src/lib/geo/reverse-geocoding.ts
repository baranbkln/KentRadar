export type ReverseGeocodedIssueLocation = {
  city: string | null;
  district: string | null;
  location_label: string | null;
  neighborhood: string | null;
};

export async function reverseGeocodeIssueLocation(): Promise<ReverseGeocodedIssueLocation | null> {
  return null;
}
