export type UserRankTheme = "bronze" | "silver" | "gold" | "emerald";

export type UserRank = {
  title:
    | "Yeni Katkıcı"
    | "Düzenli Katkıcı"
    | "Güvenilir Katkıcı"
    | "Deneyimli Katkıcı";
  theme: UserRankTheme;
  minimumScore: number;
  maximumScore: number | null;
};

const ranks: readonly UserRank[] = [
  {
    title: "Yeni Katkıcı",
    theme: "bronze",
    minimumScore: 0,
    maximumScore: 50,
  },
  {
    title: "Düzenli Katkıcı",
    theme: "silver",
    minimumScore: 51,
    maximumScore: 200,
  },
  {
    title: "Güvenilir Katkıcı",
    theme: "gold",
    minimumScore: 201,
    maximumScore: 500,
  },
  {
    title: "Deneyimli Katkıcı",
    theme: "emerald",
    minimumScore: 501,
    maximumScore: null,
  },
];

export function getUserRank(score: number): UserRank {
  const normalizedScore = Number.isFinite(score) ? Math.max(0, score) : 0;

  return (
    ranks.find(
      (rank) =>
        normalizedScore >= rank.minimumScore &&
        (rank.maximumScore === null || normalizedScore <= rank.maximumScore),
    ) ?? ranks[0]
  );
}
