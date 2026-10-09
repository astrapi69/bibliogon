/**
 * Amazon's KDP browse categories, mirrored from `bibliogon_kdp/routes.py`
 * (#738) so the category suggestions work without a backend.
 *
 * Reference data, not a user preference: the list is Amazon's own and
 * changes only when Amazon changes it, which is why it lives as a
 * constant on both sides rather than in a settings file.
 * KDP-CATEGORIES-CATALOG-SYNC-01 collapsed three drifted copies into the
 * Python constant in 2026-05; this is the fourth consumer and the only
 * one that cannot read it, so it is a deliberate duplicate - the backend
 * remains the authority, and the parity test pins the two together by
 * count and content.
 */
export const KDP_CATEGORIES: readonly string[] = [
  "Arts & Photography",
  "Biographies & Memoirs",
  "Business & Money",
  "Children's eBooks",
  "Comics & Graphic Novels",
  "Computers & Technology",
  "Cookbooks, Food & Wine",
  "Education & Teaching",
  "Engineering & Transportation",
  "Health, Fitness & Dieting",
  "History",
  "Humor & Entertainment",
  "Law",
  "Literature & Fiction",
  "Mystery, Thriller & Suspense",
  "Parenting & Relationships",
  "Politics & Social Sciences",
  "Reference",
  "Religion & Spirituality",
  "Romance",
  "Science & Math",
  "Science Fiction & Fantasy",
  "Self-Help",
  "Sports & Outdoors",
  "Teen & Young Adult",
  "Travel",
];
