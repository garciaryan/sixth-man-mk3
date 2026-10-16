// Plain types for Yahoo data. Parsers are added in Task 7.
import type { StatMap } from "../scoring.ts";

export type Category = { statId: string; name: string; display: string; displayOnly: boolean };
export type LeagueSettings = {
  leagueKey: string; name: string; season: string; startDate: string; endDate: string;
  categories: Category[]; modifiers: StatMap;
};
export type Team = { teamKey: string; name: string; managerGuids: string[] };
export type Player = {
  playerKey: string; name: string; nbaTeam: string; positions: string[]; injuryStatus: string | null; ownerTeamKey: string | null;
};
export type User = { guid: string; name: string; teamKey: string | null; checkedAt: number };
